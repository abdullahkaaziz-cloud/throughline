// Builds dist/index.html (one self-contained page) from src/.
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url), rd = p => fs.readFileSync(new URL(p, root), 'utf8');
const parts = fs.readdirSync(new URL('src/app/', root)).filter(f => f.endsWith('.js')).sort();
const html = rd('src/index.html')
  .replace('/*@CSS@*/', () => rd('src/styles.css'))
  .replace('/*@LIB@*/', () => rd('src/lib.js'))
  .replace('/*@APP@*/', () => parts.map(f => rd('src/app/' + f)).join(''));
if (html.includes('/*@')) throw new Error('unreplaced placeholder');
// Fail the build on a syntax error instead of shipping a blank page.
const script = html.match(/<script>([\s\S]*)<\/script>/);
new vm.Script(script[1], {filename: 'dist/index.html#script'});
fs.mkdirSync(new URL('dist/', root), {recursive: true});
fs.writeFileSync(new URL('dist/index.html', root), html);
// seed/ holds private essays for local tests only. It is never copied into dist/, so it can't be published.
fs.rmSync(new URL('dist/seed/', root), {recursive: true, force: true});
console.log('dist/index.html', html.length, 'bytes from', parts.length, 'app parts');
