// Sign in with ChatGPT for an open-source app that runs on the person's own computer, following OpenAI's
// documentation (https://developers.openai.com/siwc/token-sharing-open-source):
// - OpenID Connect with PKCE (S256) in the system browser, a fresh state, nonce and verifier per attempt;
// - a loopback callback on http://127.0.0.1:<port>/auth/callback (never "localhost");
// - dynamic client registration: client_id=dynamic_agent_client with agent_name_hint and a stable
//   ext_agent_host_id the first time, then the issued client id;
// - the person's ChatGPT plan for Responses API requests (store: false, stream: true), only when they granted
//   the chatgpt.tokens.use.direct scope.
// Nothing in this file returns, logs or puts a token into an error message.
import crypto from 'node:crypto';

export const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
export const RESOURCE = 'https://api.openai.com/v1';
export const DYNAMIC_CLIENT = 'dynamic_agent_client';
export const APP_NAME = 'Throughline';
export const CALLBACK_PATH = '/auth/callback';
export const USAGE_URL = 'https://chatgpt.com/settings/usage';
// Errors that mean the saved sign-in can't be renewed: sign in again.
export const DEAD_REFRESH = new Set(['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused', 'invalid_client']);

export class SiwcError extends Error {
  constructor(code, message, retryable = false) { super(message); this.code = code; this.retryable = retryable; }
  toJSON() { return {code: this.code, message: this.message, retryable: this.retryable}; }
}

const b64u = buf => Buffer.from(buf).toString('base64url');
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const safeCode = v => typeof v === 'string' && /^[a-z][a-z0-9_.]{0,99}$/i.test(v) ? v : null;
const sameText = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** Fresh secrets for one sign-in attempt. */
export function attempt() {
  const verifier = b64u(crypto.randomBytes(32));
  return {state: b64u(crypto.randomBytes(32)), nonce: b64u(crypto.randomBytes(32)), verifier, challenge: b64u(crypto.createHash('sha256').update(verifier).digest())};
}
export const newHostId = () => 'urn:uuid:' + crypto.randomUUID();

async function readJson(res, max = 512 * 1024) {
  const text = await res.text();
  if (text.length > max) throw new SiwcError('invalid_response', 'ChatGPT sent an unexpectedly large reply.');
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}
async function get(f, url, init, what) {
  try { return await f(url, Object.assign({redirect: 'error', signal: AbortSignal.timeout(20000)}, init)); }
  catch { throw new SiwcError('network_error', what + ' can’t be reached. Check your internet connection and try again.', true); }
}

/** The issuer's OpenID configuration. Every endpoint must be on the issuer's own origin. */
export async function discover(issuer, f = fetch) {
  const res = await get(f, issuer + '/.well-known/openid-configuration', {}, 'ChatGPT sign-in');
  const d = await readJson(res), origin = new URL(issuer).origin, bad = () => new SiwcError('discovery_failed', 'ChatGPT sign-in couldn’t be verified. Try again.', true);
  if (!res.ok || !isObj(d) || d.issuer !== issuer) throw bad();
  for (const k of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) if (typeof d[k] !== 'string' || new URL(d[k]).origin !== origin) throw bad();
  if (d.revocation_endpoint !== undefined && (typeof d.revocation_endpoint !== 'string' || new URL(d.revocation_endpoint).origin !== origin)) throw bad();
  return {issuer: d.issuer, authorize: d.authorization_endpoint, token: d.token_endpoint, jwks: d.jwks_uri, revoke: d.revocation_endpoint || null};
}

/** The browser URL for one attempt. It never carries a token. */
export function authorizeUrl(cfg, {clientId, hostId, redirectUri, state, nonce, challenge, reconsent}) {
  const url = new URL(cfg.authorize);
  const q = {client_id: clientId || DYNAMIC_CLIENT, response_type: 'code', redirect_uri: redirectUri, scope: SCOPES, resource: RESOURCE,
    state, nonce, code_challenge_method: 'S256', code_challenge: challenge, ext_agent_host_id: hostId};
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
  if (!clientId) url.searchParams.set('agent_name_hint', APP_NAME);   // only on the first, dynamic registration
  if (reconsent) url.searchParams.set('prompt', 'consent');
  return url.toString();
}

const CLIENT_ID = /^[A-Za-z0-9_-]{1,200}$/;
/**
 * Check the redirect back from ChatGPT. {status, result}: result is null for a request that mustn't use up the
 * attempt (another host, port or path, or the wrong state); otherwise {code, clientId} or a SiwcError.
 */
export function checkCallback(rawUrl, hostHeader, port, state, savedClientId) {
  let url;
  try { url = new URL(rawUrl, 'http://127.0.0.1:' + port); } catch { return {status: 400, result: null}; }
  if (hostHeader !== '127.0.0.1:' + port || url.origin !== 'http://127.0.0.1:' + port || url.pathname !== CALLBACK_PATH) return {status: 404, result: null};
  const states = url.searchParams.getAll('state');
  if (states.length !== 1 || !state || !sameText(states[0], state)) return {status: 400, result: null};
  const error = url.searchParams.get('error');
  if (error) return {status: 200, result: error === 'access_denied' ? new SiwcError('consent_declined', 'Sign-in was cancelled.') : new SiwcError('authorization_failed', 'ChatGPT sign-in didn’t finish. Try again.')};
  const code = url.searchParams.get('code'), returned = url.searchParams.get('client_id'), clientId = returned || savedClientId;
  if (!code || url.searchParams.getAll('code').length !== 1 || url.searchParams.getAll('client_id').length > 1 || !clientId || !CLIENT_ID.test(clientId)
    || clientId === DYNAMIC_CLIENT || (savedClientId && returned && returned !== savedClientId))
    return {status: 200, result: new SiwcError('registration_incomplete', 'ChatGPT didn’t finish registering Throughline. Try signing in again.')};
  return {status: 200, result: {code, clientId}};
}

/** A form POST to the token endpoint; OAuth errors become fixed codes. */
export async function tokenRequest(cfg, params, f = fetch) {
  const res = await get(f, cfg.token, {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded', accept: 'application/json'}, body: new URLSearchParams(params)}, 'ChatGPT sign-in');
  const d = await readJson(res);
  if (!res.ok) {
    const raw = isObj(d) ? (typeof d.error === 'string' ? d.error : isObj(d.error) ? d.error.code : '') : '';
    throw new SiwcError(safeCode(raw) || 'http_' + res.status, 'ChatGPT didn’t accept the sign-in. Try again.', res.status >= 500);
  }
  if (!isObj(d)) throw new SiwcError('invalid_token_response', 'ChatGPT sent an unexpected sign-in reply.');
  return d;
}

/** Check a token response: a Bearer token with a positive lifetime, the granted scopes, a refresh token with offline_access. */
export function tokenFields(d, now, previousScopes) {
  const scopeText = typeof d.scope === 'string' ? d.scope : previousScopes ? previousScopes.join(' ') : null;
  const scopes = scopeText ? scopeText.split(/\s+/).filter(Boolean) : null;
  if (!scopes || typeof d.access_token !== 'string' || !d.access_token || typeof d.token_type !== 'string' || d.token_type.toLowerCase() !== 'bearer'
    || typeof d.expires_in !== 'number' || !Number.isFinite(d.expires_in) || d.expires_in <= 0
    || (scopes.includes('offline_access') && (typeof d.refresh_token !== 'string' || !d.refresh_token)))
    throw new SiwcError('invalid_token_response', 'ChatGPT sent incomplete sign-in details. Try again.');
  return {access: d.access_token, refresh: typeof d.refresh_token === 'string' && d.refresh_token ? d.refresh_token : null,
    id: typeof d.id_token === 'string' && d.id_token ? d.id_token : null, expiresAt: now + d.expires_in * 1000, scopes,
    earliestRefreshAt: typeof d.earliest_refresh_at === 'number' ? d.earliest_refresh_at * (d.earliest_refresh_at < 1e12 ? 1000 : 1)
      : typeof d.earliest_refresh_at === 'string' && Date.parse(d.earliest_refresh_at) ? Date.parse(d.earliest_refresh_at) : 0};
}

const jwksCache = new Map();
async function keys(cfg, f, fresh) {
  const hit = jwksCache.get(cfg.jwks);
  if (hit && !fresh && Date.now() - hit.at < 3600000) return hit.keys;
  const res = await get(f, cfg.jwks, {}, 'ChatGPT sign-in');
  const d = await readJson(res);
  if (!res.ok || !isObj(d) || !Array.isArray(d.keys)) throw new SiwcError('identity_unavailable', 'ChatGPT couldn’t confirm who you are just now. Try again shortly.', true);
  jwksCache.set(cfg.jwks, {keys: d.keys, at: Date.now()});
  return d.keys;
}
/** Verify an ID token (RS256 against the issuer's keys; iss, aud, azp, exp, iat, sub and the attempt's nonce). */
export async function verifyIdToken(idToken, clientId, nonce, cfg, f = fetch, now = Date.now()) {
  const bad = () => new SiwcError('invalid_id_token', 'ChatGPT’s sign-in couldn’t be verified. Sign in again.');
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw bad();
  let header, claims;
  try { header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { throw bad(); }
  if (!isObj(header) || header.alg !== 'RS256' || !isObj(claims)) throw bad();
  const pick = list => list.find(k => isObj(k) && k.kty === 'RSA' && (header.kid === undefined || k.kid === header.kid) && (k.use === undefined || k.use === 'sig'));
  let jwk = pick(await keys(cfg, f, false));
  if (!jwk) jwk = pick(await keys(cfg, f, true));
  if (!jwk) throw new SiwcError('identity_unavailable', 'ChatGPT couldn’t confirm who you are just now. Try again shortly.', true);
  let ok = false;
  try { ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), crypto.createPublicKey({key: jwk, format: 'jwk'}), Buffer.from(parts[2], 'base64url')); } catch { throw bad(); }
  const t = Math.floor(now / 1000), aud = claims.aud;
  const audOk = typeof aud === 'string' ? aud === clientId : Array.isArray(aud) && aud.includes(clientId) && (aud.length === 1 || claims.azp === clientId);
  if (!ok || claims.iss !== cfg.issuer || !audOk || (claims.azp !== undefined && claims.azp !== clientId) || typeof claims.exp !== 'number' || claims.exp + 5 < t
    || typeof claims.iat !== 'number' || claims.iat - 5 > t || typeof claims.sub !== 'string' || !claims.sub || (nonce !== undefined && claims.nonce !== nonce)) throw bad();
  return {sub: claims.sub, email: typeof claims.email === 'string' ? claims.email.slice(0, 200) : '', name: typeof claims.name === 'string' ? claims.name.slice(0, 120) : ''};
}

/** Revoke a refresh token. Best effort: false when it can't be confirmed. */
export async function revoke(cfg, refreshToken, clientId, f = fetch) {
  if (!cfg.revoke) return false;
  try {
    const res = await f(cfg.revoke, {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: {'content-type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({token: refreshToken, token_type_hint: 'refresh_token', client_id: clientId})});
    await res.body?.cancel().catch(() => {});
    return res.status === 200;
  } catch { return false; }
}

// ---- Responses API on the person's plan ----
const API_ERRORS = {
  subscription_sharing_user_not_eligible: ['This ChatGPT account can’t be used here. ChatGPT Plus or Pro is needed.', false],
  subscription_sharing_usage_limit_exceeded: ['You’ve reached the ChatGPT usage limit for Throughline. Check ChatGPT Settings → Usage.', false],
  subscription_sharing_usage_unavailable: ['ChatGPT couldn’t check your usage just now. Try again shortly.', true],
  subscription_sharing_user_unavailable: ['Your ChatGPT account is unavailable just now. Try again shortly.', true],
  subscription_sharing_unsupported_capability: ['ChatGPT doesn’t support this kind of request here.', false],
  subscription_sharing_route_not_supported: ['ChatGPT doesn’t support this kind of request here.', false],
  subscription_sharing_invalid_user: ['ChatGPT couldn’t check your plan for this sign-in. Sign in again.', false],
  model_not_found: ['That model isn’t available on your plan. Choose another in the AI menu.', false],
};
/** An API error body and status as a fixed code and message, never echoing what was sent. */
export function apiError(body, status) {
  let d = isObj(body) ? body : {};
  for (let i = 0; i < 4; i++) { if (isObj(d.error)) d = d.error; else if (isObj(d.detail)) d = d.detail; else break; }
  const code = safeCode(typeof d.error === 'string' ? d.error : d.code) || '';
  const known = API_ERRORS[code] || API_ERRORS[code.replace('_v2_', '_')];
  if (known) return new SiwcError(code, known[0], known[1]);
  if (status === 401) return new SiwcError('reauth_required', 'Your ChatGPT sign-in has expired. Continue with ChatGPT again.');
  if (status === 403) return new SiwcError('forbidden', 'ChatGPT refused this request for your account or region.');
  if (status === 429) return new SiwcError('rate_limited', 'Too many requests at once. Wait a moment, then try again.', true);
  if (status >= 500) return new SiwcError('upstream_error', 'ChatGPT is unavailable just now. Try again shortly.', true);
  if (status === 400 || status === 422) return new SiwcError('invalid_request', 'ChatGPT rejected the request.');
  return new SiwcError(code || 'api_error', 'ChatGPT couldn’t finish this request. Try again.', true);
}

/** The models this plan may use, as listed for apps. */
export async function listModels(api, token, f = fetch) {
  const res = await get(f, api + '/models', {headers: {authorization: 'Bearer ' + token, accept: 'application/json'}}, 'ChatGPT');
  const d = await readJson(res, 2 * 1024 * 1024);
  if (!res.ok) throw apiError(d, res.status);
  if (!isObj(d) || !Array.isArray(d.models)) throw new SiwcError('invalid_model_list', 'ChatGPT sent an unexpected list of models.', true);
  return d.models.filter(m => isObj(m) && m.visibility === 'list' && typeof m.slug === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(m.slug))
    .map(m => ({slug: m.slug, name: typeof m.display_name === 'string' && m.display_name.trim() ? m.display_name.trim().slice(0, 120) : m.slug})).slice(0, 50);
}

/** Split a text/event-stream into parsed `data:` payloads. */
export function sseParser(onEvent) {
  let buf = '';
  const flush = block => {
    const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
    if (!data || data === '[DONE]') return;
    let ev; try { ev = JSON.parse(data); } catch { throw new SiwcError('invalid_stream', 'ChatGPT’s reply was garbled. Try again.', true); }
    onEvent(ev);
  };
  return {
    push(chunk) {
      buf += chunk;
      const re = /\r?\n\r?\n/g; let last = 0, m;
      while ((m = re.exec(buf))) { flush(buf.slice(last, m.index)); last = m.index + m[0].length; }
      buf = buf.slice(last);
    },
    end() { if (buf.trim()) flush(buf); buf = ''; },
  };
}

/**
 * One request on the person's plan. input: a prompt string or [{role: 'user'|'assistant', content}].
 * Calls onDelta(text) as the answer streams in and resolves with the whole text once ChatGPT says it's complete.
 */
export async function streamResponse(api, token, {model, input, instructions}, onDelta, signal, f = fetch) {
  const messages = typeof input === 'string' ? [{role: 'user', content: input}] : input;
  if (!Array.isArray(messages) || !messages.length || messages.some(m => !isObj(m) || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string'))
    throw new SiwcError('invalid_request', 'Throughline sent an invalid request.');
  const body = {model, input: messages.map(m => ({role: m.role, content: m.content})), store: false, stream: true};
  if (typeof instructions === 'string' && instructions) body.instructions = instructions;
  let res;
  try {
    res = await f(api + '/responses', {method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(600000)]),
      headers: {authorization: 'Bearer ' + token, 'content-type': 'application/json', accept: 'text/event-stream'}, body: JSON.stringify(body)});
  } catch (e) {
    if (signal.aborted) throw new SiwcError('cancelled', 'Stopped.');
    throw new SiwcError('network_error', 'ChatGPT can’t be reached. Check your internet connection and try again.', true);
  }
  if (!res.ok) throw apiError(await readJson(res).catch(() => null), res.status);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!res.body || (type && type !== 'text/event-stream')) { await res.body?.cancel().catch(() => {}); throw new SiwcError('invalid_stream', 'ChatGPT sent an unexpected reply. Try again.', true); }
  let text = '', done = false, failure = null;
  const parser = sseParser(ev => {
    if (done || failure || !isObj(ev)) return;
    if (ev.type === 'response.output_text.delta' && typeof ev.delta === 'string') {
      text += ev.delta;
      if (text.length > 4 * 1024 * 1024) failure = new SiwcError('response_too_large', 'ChatGPT’s answer was too long.');
      else onDelta(ev.delta);
    } else if (ev.type === 'response.failed' || ev.type === 'error') failure = apiError(ev.type === 'error' ? ev : ev.response, 0);
    else if (ev.type === 'response.incomplete') failure = new SiwcError('response_incomplete', 'ChatGPT stopped before finishing. Try again.', true);
    else if (ev.type === 'response.completed') done = true;
  });
  const decoder = new TextDecoder();
  try {
    for await (const chunk of res.body) {
      parser.push(decoder.decode(chunk, {stream: true}));
      if (done || failure) break;
    }
    parser.end();
  } catch (e) {
    if (e instanceof SiwcError) throw e;
    if (signal.aborted) throw new SiwcError('cancelled', 'Stopped.');
    throw new SiwcError('stream_interrupted', 'The connection to ChatGPT dropped. Try again.', true);
  } finally { res.body.cancel?.().catch(() => {}); }
  if (failure) throw failure;
  if (!done) throw new SiwcError('stream_interrupted', 'The connection to ChatGPT dropped. Try again.', true);
  return text;
}
