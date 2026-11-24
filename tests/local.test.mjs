// Unit tests for the local app's Sign in with ChatGPT client (local/siwc.mjs) and server checks (local/server.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import * as siwc from '../local/siwc.mjs';
import {createServer} from '../local/server.mjs';

const cfg = {issuer: 'https://auth.example', authorize: 'https://auth.example/authorize', token: 'https://auth.example/token', jwks: 'https://auth.example/jwks', revoke: null};

test('the authorize URL follows the open-source flow: dynamic client first, then the issued one', () => {
  const a = siwc.attempt();
  const first = new URL(siwc.authorizeUrl(cfg, {hostId: 'urn:uuid:1', redirectUri: 'http://127.0.0.1:4747/auth/callback', state: a.state, nonce: a.nonce, challenge: a.challenge}));
  const q = Object.fromEntries(first.searchParams);
  assert.equal(q.client_id, 'dynamic_agent_client'); assert.equal(q.agent_name_hint, 'Throughline');
  assert.equal(q.scope, 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct');
  assert.equal(q.resource, 'https://api.openai.com/v1'); assert.equal(q.code_challenge_method, 'S256'); assert.equal(q.ext_agent_host_id, 'urn:uuid:1');
  assert.equal(q.code_challenge, crypto.createHash('sha256').update(a.verifier).digest('base64url'));
  const later = new URL(siwc.authorizeUrl(cfg, {clientId: 'oaiapp_x', hostId: 'urn:uuid:1', redirectUri: 'r', state: 's', nonce: 'n', challenge: 'c', reconsent: true}));
  assert.equal(later.searchParams.get('client_id'), 'oaiapp_x'); assert.equal(later.searchParams.get('agent_name_hint'), null); assert.equal(later.searchParams.get('prompt'), 'consent');
});

test('the callback must come to the exact loopback address with the right state and one code', () => {
  const ok = siwc.checkCallback('/auth/callback?state=S&code=C&client_id=oaiapp_1', '127.0.0.1:4747', 4747, 'S', undefined);
  assert.deepEqual(ok, {status: 200, result: {code: 'C', clientId: 'oaiapp_1'}});
  assert.equal(siwc.checkCallback('/auth/callback?state=S&code=C', 'localhost:4747', 4747, 'S').result, null);
  assert.equal(siwc.checkCallback('/callback?state=S&code=C', '127.0.0.1:4747', 4747, 'S').result, null);
  assert.equal(siwc.checkCallback('/auth/callback?state=X&code=C', '127.0.0.1:4747', 4747, 'S').status, 400);
  assert.equal(siwc.checkCallback('/auth/callback?state=S&state=S&code=C', '127.0.0.1:4747', 4747, 'S').status, 400);
  assert.equal(siwc.checkCallback('/auth/callback?state=S&error=access_denied', '127.0.0.1:4747', 4747, 'S').result.code, 'consent_declined');
  for (const q of ['code=C', 'code=C&code=D&client_id=a', 'code=C&client_id=dynamic_agent_client', 'code=C&client_id=bad%20id'])
    assert.equal(siwc.checkCallback('/auth/callback?state=S&' + q, '127.0.0.1:4747', 4747, 'S').result.code, 'registration_incomplete', q);
  assert.equal(siwc.checkCallback('/auth/callback?state=S&code=C&client_id=other', '127.0.0.1:4747', 4747, 'S', 'oaiapp_1').result.code, 'registration_incomplete');
  assert.deepEqual(siwc.checkCallback('/auth/callback?state=S&code=C', '127.0.0.1:4747', 4747, 'S', 'oaiapp_1').result, {code: 'C', clientId: 'oaiapp_1'});
});

test('token responses must be complete Bearer tokens, and refreshes keep earlier scopes', () => {
  const t = siwc.tokenFields({access_token: 'a', token_type: 'Bearer', expires_in: 60, refresh_token: 'r', id_token: 'i', scope: 'openid offline_access chatgpt.tokens.use.direct'}, 1000);
  assert.equal(t.expiresAt, 61000); assert.ok(t.scopes.includes(siwc.PLAN_SCOPE));
  assert.deepEqual(siwc.tokenFields({access_token: 'b', token_type: 'bearer', expires_in: 5}, 0, ['openid']).scopes, ['openid']);
  for (const bad of [{token_type: 'Bearer', expires_in: 5, scope: 'x'}, {access_token: 'a', token_type: 'mac', expires_in: 5, scope: 'x'}, {access_token: 'a', token_type: 'Bearer', expires_in: 0, scope: 'x'},
    {access_token: 'a', token_type: 'Bearer', expires_in: 5, scope: 'offline_access'}, {access_token: 'a', token_type: 'Bearer', expires_in: 5}])
    assert.throws(() => siwc.tokenFields(bad, 0), e => e.code === 'invalid_token_response');
});

test('ID tokens are checked against the issuer keys, audience, expiry and nonce', async () => {
  const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
  const jwk = Object.assign(publicKey.export({format: 'jwk'}), {kid: 'k'});
  const c = Object.assign({}, cfg, {jwks: 'https://auth.example/jwks-' + Math.random()});
  const f = async () => new Response(JSON.stringify({keys: [jwk]}), {status: 200});
  const b = x => Buffer.from(JSON.stringify(x)).toString('base64url'), now = 1_800_000_000_000, t = now / 1000;
  const make = (claims, key = privateKey) => { const h = b({alg: 'RS256', kid: 'k'}), p = b(claims); return h + '.' + p + '.' + crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), key).toString('base64url'); };
  const good = {iss: c.issuer, aud: 'oaiapp_1', sub: 'u1', email: 'a@b.c', iat: t, exp: t + 60, nonce: 'N'};
  assert.deepEqual(await siwc.verifyIdToken(make(good), 'oaiapp_1', 'N', c, f, now), {sub: 'u1', email: 'a@b.c', name: ''});
  const other = crypto.generateKeyPairSync('rsa', {modulusLength: 2048}).privateKey;
  for (const [claims, key] of [[good, other], [{...good, aud: 'someone'}, privateKey], [{...good, iss: 'https://evil'}, privateKey], [{...good, exp: t - 60}, privateKey], [{...good, nonce: 'X'}, privateKey], [{...good, sub: ''}, privateKey]])
    await assert.rejects(siwc.verifyIdToken(make(claims, key), 'oaiapp_1', 'N', c, f, now), e => e.code === 'invalid_id_token');
  await assert.rejects(siwc.verifyIdToken('not.a.jwt.at.all', 'oaiapp_1', 'N', c, f, now), e => e.code === 'invalid_id_token');
});

test('the event stream parser joins chunks and data lines', () => {
  const got = [], p = siwc.sseParser(e => got.push(e));
  p.push('event: x\ndata: {"type":"a",'); p.push('"n":1}\n\nevent: y\r\ndata: {"type":"b"}\r\n\r\n'); p.push('data: [DONE]\n\n'); p.end();
  assert.deepEqual(got, [{type: 'a', n: 1}, {type: 'b'}]);
  assert.throws(() => { const q = siwc.sseParser(() => {}); q.push('data: {nope\n\n'); }, e => e.code === 'invalid_stream');
});

test('API errors become fixed codes and messages, never echoing the request', () => {
  assert.equal(siwc.apiError({error: {code: 'subscription_sharing_usage_limit_exceeded', message: 'my essay text'}}, 429).code, 'subscription_sharing_usage_limit_exceeded');
  assert.equal(siwc.apiError({error: {code: 'subscription_sharing_v2_user_not_eligible'}}, 403).message, 'This ChatGPT account can’t be used here. ChatGPT Plus or Pro is needed.');
  assert.equal(siwc.apiError({detail: 'text'}, 401).code, 'reauth_required');
  assert.equal(siwc.apiError(null, 503).code, 'upstream_error');
  assert.ok(!siwc.apiError({error: {code: '<script>', message: 'secret essay'}}, 400).message.includes('secret'));
});

test('the local server answers only its own page: exact host, same origin, this run’s key', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-'));
  const {server, key} = createServer({page: '<html><head></head><body><script>1</script></body></html>', port: 4999, issuer: 'https://auth.example', api: 'https://api.example', home,
    fetch: async () => { throw new Error('no network in unit tests'); }});
  await new Promise(r => server.listen(4999, '127.0.0.1', r));
  const ask = (p, headers = {}, init = {}) => fetch('http://127.0.0.1:4999' + p, Object.assign({headers}, init));
  try {
    const page = await ask('/');
    const html = await page.text();
    assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy'), /script-src 'nonce-[^']+' https:\/\/cdn\.jsdelivr\.net/);
    assert.ok(html.includes('window.TL_LOCAL={"key":"' + key + '"}') && /<script nonce="[^"]+">1<\/script>/.test(html));
    assert.equal((await ask('/api/state')).status, 403);
    assert.equal((await ask('/api/state', {'x-throughline-key': 'wrong'})).status, 403);
    assert.equal((await ask('/api/state', {'x-throughline-key': key, origin: 'https://evil.example'})).status, 403);
    assert.equal((await ask('/api/state', {'x-throughline-key': key, 'sec-fetch-site': 'cross-site'})).status, 403);
    const st = await (await ask('/api/state', {'x-throughline-key': key})).json();
    assert.equal(st.chatgpt.state, 'signed_out');
    const ai = await ask('/api/ai', {'x-throughline-key': key, 'content-type': 'application/json'}, {method: 'POST', body: '{"input":"hi"}'});
    assert.equal(ai.status, 200); assert.equal(JSON.parse((await ai.text()).trim()).error.code, 'not_signed_in');
    assert.equal((await ask('/auth/callback?state=x&code=y')).status, 400);
    const saved = JSON.parse(fs.readFileSync(path.join(home, 'chatgpt.json'), 'utf8'));
    assert.deepEqual(Object.keys(saved).sort(), ['host_id']); assert.match(saved.host_id, /^urn:uuid:/);
    if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(home, 'chatgpt.json')).mode & 0o077, 0);
    // A page that points its own name at 127.0.0.1 (DNS rebinding) sends its own Host header: refused.
    const status = await new Promise((resolve, reject) => http.get({host: '127.0.0.1', port: 4999, path: '/', headers: {host: 'evil.example:4999'}}, r => { r.resume(); resolve(r.statusCode); }).on('error', reject));
    assert.equal(status, 421);
  } finally { server.close(); server.closeAllConnections(); }
});
