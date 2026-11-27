// Builds dist/index.html (one self-contained page) from src/.
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url), rd = p => fs.readFileSync(new URL(p, root), 'utf8');
const parts = fs.readdirSync(new URL('src/app/', root)).filter(f => f.endsWith('.js')).sort();
const html = rd('src/index.html')
  .replace('/*@CSS@*/', () => rd('src/styles.css'))
  .replace('/*@LIB@*/', () => rd('src/lib.js'))
  .replace('/*@APP@*/', () => parts.map(f => rd('src/app/' + f)).join(''))
  // The help clips' captions go into the page: the publisher serves .mp4 beside it but not .vtt.
  .replace('/*@VTT@*/{}', () => JSON.stringify(Object.fromEntries(fs.readdirSync(new URL('assets/help/', root)).filter(f => /^[a-z]+\.vtt$/.test(f)).sort()
    .map(f => [f.slice(0, -4), rd('assets/help/' + f)]))).replace(/</g, '\\u003c'));
if (html.includes('/*@')) throw new Error('unreplaced placeholder');
// Fail the build on characters the publisher refuses (U+FFFD, control characters, lone surrogates, private use):
// write them as escapes (\\uFFFD) in the source instead.
{ const bad = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uD800-\uDFFF\uE000-\uF8FF\uFFFD]/u.exec(html);
  if (bad) { const at = html.slice(0, bad.index).split('\n'); throw new Error('character U+' + bad[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + ' at line ' + at.length + ', column ' + (at[at.length - 1].length + 1) + ': write it as an escape'); } }
// Fail the build on a syntax error instead of shipping a blank page.
const script = html.match(/<script>([\s\S]*)<\/script>/);
new vm.Script(script[1], {filename: 'dist/index.html#script'});
fs.mkdirSync(new URL('dist/', root), {recursive: true});
fs.writeFileSync(new URL('dist/index.html', root), html);
// The help clips ship beside the page (published as its own files: help/<id>.mp4); their captions are in the page.
fs.rmSync(new URL('dist/help/', root), {recursive: true, force: true});
fs.mkdirSync(new URL('dist/help/', root), {recursive: true});
for (const f of fs.readdirSync(new URL('assets/help/', root))) if (/^[a-z]+\.mp4$/.test(f)) fs.copyFileSync(new URL('assets/help/' + f, root), new URL('dist/help/' + f, root));
// seed/ holds private essays for local tests only. It is never copied into dist/, so it can't be published.
fs.rmSync(new URL('dist/seed/', root), {recursive: true, force: true});
console.log('dist/index.html', html.length, 'bytes from', parts.length, 'app parts');
