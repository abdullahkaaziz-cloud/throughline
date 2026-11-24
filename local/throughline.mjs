#!/usr/bin/env node
// Start Throughline on this computer: build the page, serve it on http://127.0.0.1:4747 and open the browser.
//   npx github:abdullahkaaziz-cloud/throughline     (or, in a clone: npm start)
// Options: --port <n> (or THROUGHLINE_PORT), --no-open. Stop with Ctrl+C.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createServer} from './server.mjs';

const major = +process.versions.node.split('.')[0];
if (major < 22) { console.error('Throughline needs Node.js 22 or newer (you have ' + process.versions.node + '). Get it from https://nodejs.org'); process.exit(1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), arg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const port = +(arg('--port') || process.env.THROUGHLINE_PORT || 4747);
if (!Number.isInteger(port) || port < 1024 || port > 65535) { console.error('Choose a port between 1024 and 65535.'); process.exit(1); }
// Tests point these at a mock on this computer; nothing else is allowed, so a stray setting can't send tokens elsewhere.
const local = v => typeof v === 'string' && /^http:\/\/127\.0\.0\.1:\d+(\/[\w./-]*)?$/.test(v) ? v.replace(/\/$/, '') : null;
const issuer = local(process.env.THROUGHLINE_TEST_ISSUER) || 'https://auth.openai.com';
const api = local(process.env.THROUGHLINE_TEST_API) || 'https://api.openai.com/v1';
const home = process.env.THROUGHLINE_HOME || path.join(os.homedir(), '.throughline');

execFileSync(process.execPath, [path.join(root, 'tools', 'build.mjs')], {stdio: 'ignore'});
const page = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
const {server, origin} = createServer({page, port, issuer, api, home});
server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? 'Port ' + port + ' is in use. Is Throughline already running? Open http://127.0.0.1:' + port + ', or start it with --port 4848.' : 'Throughline couldn’t start: ' + e.message);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  console.log('\n  Throughline is running at ' + origin + '\n  Your essays stay in this browser. Press Ctrl+C to stop.\n');
  if (!args.includes('--no-open') && !process.env.THROUGHLINE_NO_OPEN) {
    const [cmd, a] = process.platform === 'darwin' ? ['open', [origin]] : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', origin]] : ['xdg-open', [origin]];
    try { spawn(cmd, a, {stdio: 'ignore', detached: true, shell: false}).on('error', () => {}).unref(); } catch {}
  }
});
const stop = () => { server.close(); server.closeAllConnections?.(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
