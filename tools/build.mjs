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
const seed = new URL('seed/test-essays.json', root);
if (fs.existsSync(seed)) { fs.mkdirSync(new URL('dist/seed/', root), {recursive: true}); fs.copyFileSync(seed, new URL('dist/seed/test-essays.json', root)); }
console.log('dist/index.html', html.length, 'bytes from', parts.length, 'app parts');
