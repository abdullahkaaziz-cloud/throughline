// Test double for OpenAI's sign-in and Responses API, for the local app's tests (tools/test_local.py).
//   node tools/mock-openai.mjs <port>
// It checks what the app sends the way OpenAI documents it, records each request at GET /__log, and switches
// behaviour with GET /__mode?decline=1|noplan=1|limit=1|short=1 (all off by default; /__mode alone resets).
import http from 'node:http';
import crypto from 'node:crypto';

const port = +process.argv[2] || 4790, origin = 'http://127.0.0.1:' + port;
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
const jwk = Object.assign(publicKey.export({format: 'jwk'}), {kid: 'k1', use: 'sig', alg: 'RS256'});
const b64u = x => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
const sign = claims => { const head = b64u({alg: 'RS256', kid: 'k1', typ: 'JWT'}), body = b64u(claims); return head + '.' + body + '.' + crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), privateKey).toString('base64url'); };
let mode = {}, log = [], codes = new Map(), refreshes = new Map(), n = 0;
const ACCESS = () => 'AT_SECRET_' + (++n) + '_7f3a', REFRESH = () => 'RT_SECRET_' + (++n) + '_9c1e';
const send = (res, status, body, type = 'application/json') => { res.writeHead(status, {'content-type': type}); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
const bodyOf = req => new Promise(r => { let s = ''; req.on('data', c => s += c); req.on('end', () => r(s)); });
const tokens = (clientId, scope, nonce) => {
  const access = ACCESS(), refresh = REFRESH(), now = Math.floor(Date.now() / 1000);
  refreshes.set(refresh, {clientId, scope});
  return {access_token: access, token_type: 'Bearer', expires_in: mode.short ? 1 : 3600, refresh_token: refresh, scope,
    id_token: sign({iss: origin, aud: clientId, sub: 'user-1', email: 'tester@example.com', name: 'Test Person', iat: now, exp: now + 3600, ...(nonce ? {nonce} : {})})};
};
// A review that quotes the essay's first two sentences, as the review rules ask.
function review(input) {
  const m = input.match(/^\[1\] (.+)$/m), first = m ? m[1] : '';
  const sents = first.split(/(?<=[.!?])\s+/).filter(Boolean);
  return {summary: {thesis: 'Mock thesis.', start_with: 'Mock: start here.'}, brief: [], links: [],
    issues: [{type: 'logic', severity: 'medium', confidence: 0.8, title: 'Mock: a step is missing', passage_a: {quote: sents[0] || first}, passage_b: null, explanation: 'Mock explanation.', fix: 'Mock fix.', suggestion: null},
      {type: 'clarity', severity: 'low', confidence: 0.7, title: 'Mock: hard to follow', passage_a: {quote: sents[1] || sents[0] || first}, passage_b: null, explanation: 'Mock explanation.', fix: 'Mock fix.', suggestion: null}]};
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, origin), auth = req.headers.authorization || '';
  if (url.pathname === '/__mode') { mode = Object.fromEntries([...url.searchParams].map(([k, v]) => [k, v === '1'])); log = []; send(res, 200, mode); return; }
  if (url.pathname === '/__log') { send(res, 200, log); return; }
  if (url.pathname === '/.well-known/openid-configuration') {
    send(res, 200, {issuer: origin, authorization_endpoint: origin + '/api/accounts/authorize', token_endpoint: origin + '/api/accounts/oauth/token', jwks_uri: origin + '/.well-known/jwks.json', revocation_endpoint: origin + '/api/accounts/oauth/revoke'});
    return;
  }
  if (url.pathname === '/.well-known/jwks.json') { send(res, 200, {keys: [jwk]}); return; }
  if (url.pathname === '/api/accounts/authorize') {
    const q = Object.fromEntries(url.searchParams);
    log.push({at: 'authorize', q});
    const redirect = new URL(q.redirect_uri);
    const ok = q.response_type === 'code' && q.scope === SCOPES && q.resource === 'https://api.openai.com/v1' && q.code_challenge_method === 'S256' && q.code_challenge
      && /^urn:uuid:/.test(q.ext_agent_host_id || '') && redirect.hostname === '127.0.0.1' && redirect.pathname === '/auth/callback'
      && (q.client_id === 'dynamic_agent_client' ? q.agent_name_hint === 'Throughline' : q.client_id === 'oaiapp_test' && !q.agent_name_hint);
    if (!ok) { send(res, 400, 'bad authorize request', 'text/plain'); return; }
    redirect.searchParams.set('state', q.state);
    if (mode.decline) redirect.searchParams.set('error', 'access_denied');
    else {
      const code = 'code-' + crypto.randomBytes(6).toString('hex');
      codes.set(code, {challenge: q.code_challenge, redirect: q.redirect_uri, nonce: q.nonce, scope: mode.noplan ? 'openid profile email offline_access' : SCOPES});
      redirect.searchParams.set('code', code); redirect.searchParams.set('client_id', 'oaiapp_test');
    }
    res.writeHead(302, {location: redirect.toString()}); res.end(); return;
  }
  if (url.pathname === '/api/accounts/oauth/token' && req.method === 'POST') {
    const f = Object.fromEntries(new URLSearchParams(await bodyOf(req)));
    log.push({at: 'token', grant: f.grant_type, client_id: f.client_id, resource: f.resource});
    if (f.grant_type === 'authorization_code') {
      const c = codes.get(f.code); codes.delete(f.code);
      const challenge = f.code_verifier && crypto.createHash('sha256').update(f.code_verifier).digest('base64url');
      if (!c || f.client_id !== 'oaiapp_test' || challenge !== c.challenge || f.redirect_uri !== c.redirect || f.resource !== 'https://api.openai.com/v1') { send(res, 400, {error: 'invalid_grant'}); return; }
      send(res, 200, tokens(f.client_id, c.scope, c.nonce)); return;
    }
    if (f.grant_type === 'refresh_token') {
      const r = refreshes.get(f.refresh_token); refreshes.delete(f.refresh_token);
      if (!r || f.client_id !== r.clientId) { send(res, 400, {error: 'refresh_token_reused'}); return; }
      const t = tokens(r.clientId, r.scope); delete t.id_token; delete t.scope; send(res, 200, t); return;
    }
    send(res, 400, {error: 'unsupported_grant_type'}); return;
  }
  if (url.pathname === '/api/accounts/oauth/revoke' && req.method === 'POST') { log.push({at: 'revoke'}); send(res, 200, ''); return; }
  if (!/^Bearer AT_SECRET_\d+_7f3a$/.test(auth)) { send(res, 401, {error: {code: 'invalid_token', message: 'bad token'}}); return; }
  if (url.pathname === '/v1/models') {
    send(res, 200, {models: [{slug: 'gpt-test-sol', display_name: 'GPT Test Sol', visibility: 'list'}, {slug: 'gpt-test-luna', display_name: 'GPT Test Luna', visibility: 'list'}, {slug: 'gpt-hidden', display_name: 'Hidden', visibility: 'hide'}]});
    return;
  }
  if (url.pathname === '/v1/responses' && req.method === 'POST') {
    let b; try { b = JSON.parse(await bodyOf(req)); } catch { send(res, 400, {error: {code: 'invalid_request'}}); return; }
    const input = Array.isArray(b.input) ? b.input.map(m => m.content).join('\n') : '';
    log.push({at: 'responses', model: b.model, store: b.store, stream: b.stream, roles: Array.isArray(b.input) ? b.input.map(m => m.role) : null, token: auth.slice(7), keys: Object.keys(b).sort(), len: input.length});
    if (mode.limit) { send(res, 429, {error: {code: 'subscription_sharing_usage_limit_exceeded', message: 'limit'}}); return; }
    if (b.store !== false || b.stream !== true || !Array.isArray(b.input)) { send(res, 400, {error: {code: 'invalid_request_error', param: 'store'}}); return; }
    const answer = JSON.stringify(input.includes('ESSAY (each paragraph') ? review(input) : {ok: true});
    res.writeHead(200, {'content-type': 'text/event-stream'});
    res.write('event: response.created\ndata: ' + JSON.stringify({type: 'response.created'}) + '\n\n');
    for (let i = 0; i < answer.length; i += 40) res.write('event: response.output_text.delta\ndata: ' + JSON.stringify({type: 'response.output_text.delta', delta: answer.slice(i, i + 40)}) + '\n\n');
    res.end('event: response.completed\ndata: ' + JSON.stringify({type: 'response.completed', response: {status: 'completed'}}) + '\n\n');
    return;
  }
  send(res, 404, {error: {code: 'not_found'}});
}).listen(port, '127.0.0.1', () => console.log('mock-openai ready ' + origin));
