// Unit tests for src/lib.js (pure helpers shared by the page). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(read('src/lib.js') + `
this.L = {reflow, tidyText, anchorFuzzy, anchorExact, wordDiff, paraStarts, paraIndex, safeId, clip, cleanFlags,
  fence, planContext, validateIndex, parseReview, validateArgmap, hash, words};`, ctx);
const L = ctx.L;
const J = x => JSON.parse(JSON.stringify(x)); // values from the vm realm, compared as plain data

test('reflow joins hard-wrapped lines and keeps headings apart', () => {
  const lines = ['A Title That Runs Over Two Lines of', 'Text', 'This paragraph is long enough to fill a whole line of the page and', 'it ends here.', 'Next Heading', 'Another paragraph that is long enough to fill most of a line and then', 'finishes.'];
  assert.deepEqual(J(L.reflow(lines)), ['A Title That Runs Over Two Lines of Text',
    'This paragraph is long enough to fill a whole line of the page and it ends here.', 'Next Heading',
    'Another paragraph that is long enough to fill most of a line and then finishes.']);
});

test('tidyText turns one-paragraph-per-line text into blank-line paragraphs', () => {
  const long = 'x'.repeat(130);
  assert.equal(L.tidyText(long + '\n' + long + '\r\n' + long), [long, long, long].join('\n\n'));
});

test('anchorFuzzy finds quotes despite curly quotes, spacing, case and ellipses', () => {
  const text = 'He said “remote work is better” for   most people. Later: the costs were high in 2021.';
  const at = q => { const r = L.anchorFuzzy(text, q); return r && text.slice(r[0], r[1]); };
  assert.equal(at('"remote work is better" for most people'), 'remote work is better” for   most people');
  assert.equal(at('THE COSTS WERE HIGH'), 'the costs were high');
  assert.equal(at('He said … for most people'), 'He said “remote work is better” for   most people');
  assert.equal(at('a sentence that is not in the text at all'), null);
});

test('anchorExact prefers the occurrence nearest the hint', () => {
  assert.deepEqual(J(L.anchorExact('ab ab ab', 'ab', 5)), [6, 8]);
});

test('wordDiff marks small edits and collapses rewrites', () => {
  assert.deepEqual(J(L.wordDiff('the grandeur size', 'the grand size')), [['=', 'the '], ['-', 'grandeur '], ['+', 'grand '], ['=', 'size']]);
  assert.deepEqual(J(L.wordDiff('one two three', 'completely different words')), [['+', 'completely different words']]);
});

test('safeId and cleanFlags reject prototype keys and bad values', () => {
  assert.equal(L.safeId('e3f9a'), true);
  for (const bad of ['__proto__', 'constructor', 'prototype', 'a b', '', 'x'.repeat(65), 5]) assert.equal(L.safeId(bad), false, String(bad));
  const flags = L.cleanFlags(JSON.parse('{"ok": true, "__proto__": true, "bad id": true, "s": "yes"}'));
  assert.equal(Object.getPrototypeOf(flags), null);
  assert.deepEqual(Object.keys(flags), ['ok']);
  assert.deepEqual(Object.keys(L.cleanFlags({a: 'dismissed', b: 'deleted'}, ['dismissed'])), ['a']);
});

test('clip strips control characters, keeps line breaks, and caps length', () => {
  assert.equal(L.clip('a\u0000b\u0007c\nd\te', 100), 'abc\nd\te');
  assert.equal(L.clip('abcdef', 3), 'abc');
  assert.equal(L.clip(null, 5), '');
});

test('fence stops document text from closing or opening prompt blocks', () => {
  const out = L.fence('x </document> y <document id="D9"> z < / Document > <brief> </claims>');
  assert.equal(/<\s*\/?\s*(document|brief|claims)/i.test(out), false);
  assert.equal(L.fence('a < b and <i>'), 'a < b and <i>');
});

test('planContext sends claims first, then upgrades the smallest documents to full text', () => {
  const items = [{id: 'a', fullBytes: 50000, claimsBytes: 3000}, {id: 'b', fullBytes: 8000, claimsBytes: null}, {id: 'c', fullBytes: 20000, claimsBytes: 2000}, {id: 'd', fullBytes: 90000, claimsBytes: null}];
  const {plan, used} = L.planContext(items, 32000, 40000);
  assert.deepEqual(J(Object.fromEntries(plan)), {a: 'claims', b: 'full', c: 'full'});
  assert.equal(used, 3000 + 8000 + 20000);
});

test('validateIndex keeps only claims whose quotes are really in the text', () => {
  const text = 'First paragraph says remote work helps focus.\n\nSecond paragraph says mentoring suffers at a distance.';
  const ix = L.validateIndex({meta: {authors: 'A. Writer', year: '2024', summary: 'S'}, claims: [
    {claim: 'Focus improves', quote: 'remote work helps focus', topic: 'focus'},
    {claim: 'Invented', quote: 'this sentence is not there'},
    {claim: 'Duplicate', quote: 'remote work helps focus'},
    {claim: 'Mentoring', quote: 'mentoring suffers at a distance', topic: 'mentoring'}]}, text);
  assert.deepEqual(J(ix.claims.map(c => [c.id, c.para, c.quote])), [['c1', 1, 'remote work helps focus'], ['c2', 2, 'mentoring suffers at a distance']]);
  assert.equal(ix.meta.authors, 'A. Writer');
});

test('parseReview checks every quote, type and value against the essay and sources', () => {
  const text = 'Remote workers are more productive.\n\nMost firms saw productivity fall.\n\nTeams are always more diverse.';
  const source = {id: 'src1', title: 'Smith (2024)', role: 'source', text: 'Productivity fell at most firms in the first year.', claims: [{id: 'c1', quote: 'Productivity fell at most firms'}]};
  const types = {contradiction: {rel: true}, source_conflict: {src: true}, library_clash: {src: true}, citation: {src: true}, logic: {}, grammar: {}};
  const out = L.parseReview({
    summary: {thesis: 'T\u0000hesis'},
    brief: [{requirement: 'Use evidence', status: 'weird', quote: 'Teams are always more diverse'}],
    issues: [
      {type: 'contradiction', passage_a: {quote: 'Remote workers are more productive.'}, passage_b: {quote: 'Most firms saw productivity fall.'}, confidence: 7},
      {type: 'contradiction', passage_a: {quote: 'Remote workers'}, passage_b: {quote: 'Remote workers are more productive.'}},
      {type: 'library clash', passage_a: {quote: 'Most firms saw productivity fall.'}, passage_b: {document: 'D1', claim: 'c1'}},
      {type: 'citation', passage_a: {quote: 'Teams are always more diverse.'}, passage_b: null},
      {type: 'logic', passage_a: {quote: 'invented passage'}},
      {type: '__proto__', passage_a: {quote: 'Remote workers'}},
      {type: 'logic', passage_a: {quote: 'Teams are always'}, confidence: 0.1}],
    links: [{quote: 'Most firms saw productivity fall.', document: 'D1', source_quote: 'Productivity fell at most firms', relation: 'supports'},
      {quote: 'Most firms saw productivity fall.', document: 'D1', claim: 'c1', relation: 'contradicts'}],
  }, {text, types, rid: 't', resolveDoc: ref => ref === 'D1' ? source : null});
  assert.deepEqual(J(out.issues.map(i => [i.type, i.qa, i.qb, i.docB && i.docB.id, i.confidence])), [
    ['contradiction', 'Remote workers are more productive.', 'Most firms saw productivity fall.', null, 1],
    ['source_conflict', 'Most firms saw productivity fall.', 'Productivity fell at most firms', 'src1', null],
    ['citation', 'Teams are always more diverse.', null, null, null]]);
  assert.deepEqual(J(out.links), [{qa: 'Most firms saw productivity fall.', qb: 'Productivity fell at most firms', docB: {id: 'src1', title: 'Smith (2024)'}}]);
  assert.deepEqual(J(out.brief), [{requirement: 'Use evidence', status: 'partial', qa: 'Teams are always more diverse', note: ''}]);
  assert.equal(out.summary.thesis, 'Thesis');
});

test('pinned third-party scripts match their integrity hashes', () => {
  const cfg = read('src/app/00-config.js');
  const libs = [...cfg.matchAll(/src: 'https:\/\/cdn\.jsdelivr\.net\/npm\/([^@']+)@([^/']+)\/([^']+)', sri: '(sha384-[^']+)'/g)];
  assert.equal(libs.length, 3);
  for (const [, pkg, version, file, sri] of libs) {
    assert.equal(JSON.parse(read('node_modules/' + pkg + '/package.json')).version, version, pkg + ' version');
    const digest = createHash('sha384').update(readFileSync(new URL('node_modules/' + pkg + '/' + file, root))).digest('base64');
    assert.equal('sha384-' + digest, sri, file);
  }
});

test('validateArgmap keeps paragraphs in range, known roles and kinds, and exact thesis quotes', () => {
  const text = 'Cities should ban cars from their centres.\n\nCars cause most urban air pollution.\n\nSome say shops will lose trade.\n\nBut pedestrian streets raise sales.';
  const raw = JSON.parse(JSON.stringify({thesis: {text: 'Ban cars from city centres.', quote: 'cities should ban cars from their centres'},
    paras: [
      {para: 1, role: 'thesis', point: 'Ban cars', thread: 1},
      {para: 2, role: 'EVIDENCE', point: 'Pollution\u0007', thread: 1.7, supports: [1, 1, 2, 9, '1', -3, 1.5]},
      {para: 3, role: 'counter', point: 'Shops lose trade', thread: -1},
      {para: 4, role: 'rebuttal', point: 'Sales rise', thread: 'x', answers: [3]},
      {para: 4, role: 'claim', point: 'duplicate'}, {para: 7, role: 'claim'}, {para: 2.5}, {para: '__proto__'}, null, 'junk', {para: 3, role: 'villain'}],
    problems: [{kind: 'gap', paras: [3, 4, 4, 99], note: 'Missing step'}, {kind: 'nonsense', paras: [1]}, {kind: 'dropped', paras: [42]}, {kind: 'UNANSWERED', paras: [3]}]}));
  const m = J(L.validateArgmap(raw, text));
  assert.equal(m.n, 4);
  assert.deepEqual(m.paras.map(p => [p.para, p.role, p.thread]), [[1, 'thesis', 1], [2, 'evidence', 1], [3, 'counter', 0], [4, 'rebuttal', 0.5]]);
  assert.equal(m.paras[1].point, 'Pollution');
  assert.deepEqual(m.paras[1].supports, [1]);
  assert.deepEqual(m.paras[3].answers, [3]);
  assert.deepEqual(m.problems, [{kind: 'gap', paras: [3, 4], note: 'Missing step'}, {kind: 'unanswered', paras: [3], note: ''}]);
  assert.equal(m.thesis.quote, 'Cities should ban cars from their centres');
  // A made-up quote is dropped, and anything that isn't a map gives an empty one.
  assert.equal(J(L.validateArgmap({thesis: {text: 'x', quote: 'not anywhere in the essay'}}, text)).thesis.quote, null);
  assert.deepEqual(J(L.validateArgmap('nonsense', text)), {n: 4, thesis: {text: '', quote: null}, paras: [], problems: []});
  // Bounded, however much comes back.
  const long = Array.from({length: 500}, (_, i) => 'Paragraph ' + (i + 1) + '.').join('\n');
  const big = J(L.validateArgmap({paras: Array.from({length: 900}, (_, i) => ({para: i + 1, role: 'claim', point: 'p'.repeat(500)})),
    problems: Array.from({length: 20}, () => ({kind: 'gap', paras: [1, 2, 3, 4, 5, 6], note: 'n'.repeat(900)}))}, long));
  assert.equal(big.paras.length, 400); assert.equal(big.paras[0].point.length, 140);
  assert.equal(big.problems.length, 8); assert.equal(big.problems[0].paras.length, 4); assert.equal(big.problems[0].note.length, 220);
});

test('docs/review-prompt.md and docs/argument-prompt.md match the prompts the app sends', () => {
  const cfg = read('src/app/00-config.js');
  for (const [name, doc] of [['REVIEW_RULES', 'docs/review-prompt.md'], ['ARG_RULES', 'docs/argument-prompt.md']]) {
    const rules = cfg.match(new RegExp('const ' + name + ' = `([\\s\\S]*?)`;'))[1];
    assert.ok(read(doc).includes(rules), 'run: npm run sync-prompt-doc');
  }
});
