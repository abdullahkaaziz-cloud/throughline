// Throughline on your own computer: serves the app on http://127.0.0.1:<port> and lets it use the person's
// ChatGPT plan through Sign in with ChatGPT (./siwc.mjs).
// - Only 127.0.0.1 is bound, and every request must name that exact host and port (no DNS rebinding).
// - The page gets a random key per launch; every /api call must send it and come from the page's own origin.
// - Tokens stay in this process's memory: never on disk, never sent to the page. Only the host id, the issued
//   client id and the chosen model (none of them secret) are saved, in ~/.throughline/chatgpt.json.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as siwc from './siwc.mjs';

const JSON_LIMIT = 4 * 1024 * 1024;
const sameText = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function createServer({page, port, issuer, api, home, fetch: f = fetch, now = () => Date.now()}) {
  const key = crypto.randomBytes(32).toString('base64url');
  const origin = 'http://127.0.0.1:' + port, host = '127.0.0.1:' + port, redirectUri = origin + siwc.CALLBACK_PATH;
  // ---- what survives a restart (nothing secret) ----
  const file = path.join(home, 'chatgpt.json');
  let saved = {};
  try { const x = JSON.parse(fs.readFileSync(file, 'utf8')); if (x && typeof x === 'object') saved = x; } catch {}
  if (typeof saved.host_id !== 'string' || !/^urn:uuid:[0-9a-f-]{36}$/.test(saved.host_id)) saved = {host_id: siwc.newHostId()};
  const save = () => {
    fs.mkdirSync(home, {recursive: true, mode: 0o700});
    const tmp = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({host_id: saved.host_id, client_id: saved.client_id, model: saved.model}, null, 2), {mode: 0o600});
    fs.renameSync(tmp, file);
  };
  save();
  // ---- this run's sign-in, in memory only ----
  let cfg = null, pending = null, tokens = null, who = null, models = [], refreshing = null, lastError = null;
  const config = async () => cfg || (cfg = await siwc.discover(issuer, f));
  const state = () => !tokens ? (who ? 'reauth_required' : 'signed_out') : tokens.scopes.includes(siwc.PLAN_SCOPE) ? 'connected' : 'scope_missing';
  const model = () => models.find(m => m.slug === saved.model) ? saved.model : models[0] ? models[0].slug : null;

  async function access(force) {
    if (!tokens) throw new siwc.SiwcError(who ? 'reauth_required' : 'not_signed_in', who ? 'Your ChatGPT sign-in has expired. Continue with ChatGPT again.' : 'Continue with ChatGPT to use AI review.');
    if (!tokens.scopes.includes(siwc.PLAN_SCOPE)) throw new siwc.SiwcError('scope_missing', 'You signed in but didn’t allow Throughline to use your ChatGPT plan. Continue with ChatGPT again and allow it.');
    // Refresh a little before expiry (two minutes, or half the lifetime of a short token), never before ChatGPT allows it.
    const left = tokens.expiresAt - now();
    if (!force && (left > Math.min(120000, tokens.ttl / 2) || (tokens.earliestRefreshAt > now() && left > 0))) return tokens.access;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      if (!tokens.refresh) { tokens = null; throw new siwc.SiwcError('reauth_required', 'Your ChatGPT sign-in has expired. Continue with ChatGPT again.'); }
      const c = await config();
      let d;
      try { d = await siwc.tokenRequest(c, {grant_type: 'refresh_token', client_id: saved.client_id, refresh_token: tokens.refresh, resource: siwc.RESOURCE}, f); }
      catch (e) {
        if (e instanceof siwc.SiwcError && siwc.DEAD_REFRESH.has(e.code)) { tokens = null; throw new siwc.SiwcError('reauth_required', 'Your ChatGPT sign-in has expired. Continue with ChatGPT again.'); }
        throw e;
      }
      const t = siwc.tokenFields(d, now(), tokens.scopes);
      if (t.id) { const id = await siwc.verifyIdToken(t.id, saved.client_id, undefined, c, f, now()); if (who && id.sub !== who.sub) { tokens = null; throw new siwc.SiwcError('account_mismatch', 'ChatGPT returned a different account. Sign in again.'); } }
      tokens = Object.assign({}, tokens, {access: t.access, refresh: t.refresh || tokens.refresh, expiresAt: t.expiresAt, ttl: t.expiresAt - now(), earliestRefreshAt: t.earliestRefreshAt, scopes: t.scopes});
      return tokens.access;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  async function loadModels() {
    try { models = await siwc.listModels(api, await access(false), f); }
    catch (e) { if (e.code === 'reauth_required') tokens = null; models = []; }
  }

  // ---- the page, with a script nonce and this run's key ----
  function sendPage(res) {
    const nonce = crypto.randomBytes(18).toString('base64');
    const html = page.replace(/<script>/g, '<script nonce="' + nonce + '">')
      .replace('<head>', '<head><script nonce="' + nonce + '">window.TL_LOCAL=' + JSON.stringify({key}).replace(/</g, '\\u003c') + ';</script>');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': ["default-src 'self'", "script-src 'nonce-" + nonce + "' https://cdn.jsdelivr.net", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        'font-src https://fonts.gstatic.com', "img-src 'self' data: blob:", "connect-src 'self'", "worker-src 'self' blob:", "object-src 'none'", "base-uri 'none'",
        "form-action 'self'", "frame-ancestors 'none'"].join('; '),
    });
    res.end(html);
  }
  const send = (res, status, body) => {
    res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
    res.end(JSON.stringify(body));
  };
  const fail = (res, e) => send(res, e instanceof siwc.SiwcError && /^(not_signed_in|reauth_required|scope_missing)$/.test(e.code) ? 401 : 502,
    {error: e instanceof siwc.SiwcError ? e.toJSON() : {code: 'internal', message: 'Something went wrong. Try again.'}});
  async function body(req) {
    let size = 0; const chunks = [];
    for await (const c of req) { size += c.length; if (size > JSON_LIMIT) throw new siwc.SiwcError('too_large', 'That request is too large.'); chunks.push(c); }
    try { const x = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
    catch { throw new siwc.SiwcError('invalid_request', 'Throughline sent an invalid request.'); }
  }
  const view = () => ({chatgpt: {state: state(), email: who ? who.email : '', name: who ? who.name : '', models, model: model(), usageUrl: siwc.USAGE_URL,
    error: lastError ? lastError.toJSON() : null}});

  async function handle(req, res) {
    // Exact host only, so a web page that points its own name at 127.0.0.1 can't talk to us.
    if (req.headers.host !== host) { res.writeHead(421, {'Content-Type': 'text/plain'}); res.end('Wrong host'); return; }
    const url = new URL(req.url, origin);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) { sendPage(res); return; }
    if (req.method === 'GET' && url.pathname === siwc.CALLBACK_PATH) { await callback(req, res); return; }
    if (!url.pathname.startsWith('/api/')) { res.writeHead(404, {'Content-Type': 'text/plain'}); res.end('Not found'); return; }
    // The API answers the page alone: its key, and (when the browser says) its origin.
    const from = req.headers.origin, site = req.headers['sec-fetch-site'];
    if ((from && from !== origin) || (site && site !== 'same-origin') || !sameText(req.headers['x-throughline-key'], key)) { send(res, 403, {error: {code: 'forbidden', message: 'Not allowed.'}}); return; }
    try {
      if (req.method === 'GET' && url.pathname === '/api/state') { if (state() === 'connected' && !models.length) await loadModels(); send(res, 200, view()); return; }
      if (req.method !== 'POST') { send(res, 405, {error: {code: 'method', message: 'Not allowed.'}}); return; }
      const b = await body(req);
      if (url.pathname === '/api/chatgpt/connect') {
        const c = await config(), a = siwc.attempt();
        pending = Object.assign(a, {at: now()});
        lastError = null;
        send(res, 200, {url: siwc.authorizeUrl(c, {clientId: saved.client_id, hostId: saved.host_id, redirectUri, state: a.state, nonce: a.nonce, challenge: a.challenge, reconsent: b.reconsent === true})});
        return;
      }
      if (url.pathname === '/api/chatgpt/model') {
        if (typeof b.model !== 'string' || !models.some(m => m.slug === b.model)) { send(res, 400, {error: {code: 'invalid_model', message: 'Choose a model from the list.'}}); return; }
        saved.model = b.model; save(); send(res, 200, view()); return;
      }
      if (url.pathname === '/api/chatgpt/disconnect') {
        const t = tokens; tokens = null; who = null; models = [];
        const revoked = t && t.refresh && cfg ? await siwc.revoke(cfg, t.refresh, saved.client_id, f) : true;
        send(res, 200, Object.assign(view(), {revoked})); return;
      }
      if (url.pathname === '/api/ai') { await ai(req, res, b); return; }
      send(res, 404, {error: {code: 'not_found', message: 'Not found.'}});
    } catch (e) { if (!res.headersSent) fail(res, e); else res.end(); }
  }

  async function callback(req, res) {
    const p = pending && now() - pending.at < 600000 ? pending : null;
    const {status, result} = siwc.checkCallback(req.url, req.headers.host, port, p ? p.state : '', saved.client_id);
    const back = tag => { res.writeHead(302, {Location: '/#chatgpt=' + tag, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'}); res.end(); };
    if (!result) { res.writeHead(status, {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(status === 400 ? 'This sign-in link is out of date. Go back to Throughline and press Continue with ChatGPT again.' : 'Not found'); return; }
    pending = null;
    if (result instanceof siwc.SiwcError) { lastError = result; back(result.code === 'consent_declined' ? 'declined' : 'error'); return; }
    try {
      // Keep the issued client id even if the code fails, so the next try doesn't register again.
      if (saved.client_id !== result.clientId) { saved.client_id = result.clientId; save(); }
      const c = await config();
      const d = await siwc.tokenRequest(c, {grant_type: 'authorization_code', client_id: result.clientId, code: result.code, code_verifier: p.verifier, redirect_uri: redirectUri, resource: siwc.RESOURCE}, f);
      const t = siwc.tokenFields(d, now());
      if (!t.id) throw new siwc.SiwcError('invalid_id_token', 'ChatGPT’s sign-in couldn’t be verified. Sign in again.');
      const id = await siwc.verifyIdToken(t.id, result.clientId, p.nonce, c, f, now());
      tokens = {access: t.access, refresh: t.refresh, expiresAt: t.expiresAt, ttl: t.expiresAt - now(), earliestRefreshAt: t.earliestRefreshAt, scopes: t.scopes};
      who = id; lastError = null;
      if (state() === 'connected') await loadModels();
      back(state() === 'connected' ? 'connected' : 'allow');
    } catch (e) { lastError = e instanceof siwc.SiwcError ? e : new siwc.SiwcError('sign_in_failed', 'ChatGPT sign-in didn’t finish. Try again.'); back('error'); }
  }

  // One AI request, streamed back as lines of JSON: {"d": text} …, then {"done": true} or {"error": {...}}.
  // Errors come the same way, so the page reads one kind of answer.
  async function ai(req, res, b) {
    const input = typeof b.input === 'string' ? b.input : Array.isArray(b.input) ? b.input : null;
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableFinished) ctl.abort(); });
    let started = false;
    const write = obj => { if (!started) { started = true; res.writeHead(200, {'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}); } res.write(JSON.stringify(obj) + '\n'); };
    const run = async force => siwc.streamResponse(api, await access(force), {model: m, input}, d => write({d}), ctl.signal, f);
    let m = null;
    try {
      if (!input) throw new siwc.SiwcError('invalid_request', 'Throughline sent an invalid request.');
      await access(false);
      m = model();
      if (!m) { await loadModels(); m = model(); }
      if (!m) throw new siwc.SiwcError('no_models', 'No ChatGPT models are available for your plan right now.');
      try { await run(false); }
      catch (e) { if (!started && e.code === 'reauth_required' && tokens) await run(true); else throw e; }
      write({done: true}); res.end();
    } catch (e) {
      const err = e instanceof siwc.SiwcError ? e : new siwc.SiwcError('internal', 'Something went wrong. Try again.');
      if (err.code === 'reauth_required') tokens = null;
      write({error: err.toJSON()}); res.end();
    }
  }

  const server = http.createServer((req, res) => { handle(req, res).catch(() => { if (!res.headersSent) { res.writeHead(500); } res.end(); }); });
  server.requestTimeout = 0; server.headersTimeout = 20000;
  return {server, key, origin};
}
