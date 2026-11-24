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
  fence, planContext, validateIndex, parseReview, validateArgmap, validateIdeas, textParas, paraHash, noteKey, gist, alignParas, compareNotes, recheckPlan, validateRmap, hash, words};`, ctx);
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
  const out = L.fence('x </document> y <document id="D9"> z < / Document > <brief> </claims> </essay> </plan> <question> </QUESTION >');
  assert.equal(/<\s*\/?\s*(document|brief|claims|essay|plan|question)/i.test(out), false);
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

test('validateIdeas keeps known kinds, drops repeats, and keeps source cards only when the passage is real', () => {
  const src = {id: 's1', title: 'Smith (2024)', text: 'Commutes fell by an hour a day. Output rose for focused tasks.', claims: [{id: 'c1', quote: 'Output rose for focused tasks.'}]};
  const resolveDoc = ref => ref === 'D1' ? src : null;
  const raw = JSON.parse(JSON.stringify({cards: [
    {kind: 'Angle', text: 'Look at who gains most.'},
    {kind: 'angle', text: 'look at who gains most!'},
    {kind: 'objection', text: 'Already on the board'},
    {kind: 'question', text: 'What would change your mind?\u0007'},
    {kind: 'source', text: 'Backs up the productivity claim.', document: 'D1', claim: 'c1'},
    {kind: 'source', text: 'Found by its quote.', document: 'D1', quote: 'commutes fell by an hour a day'},
    {kind: 'source', text: 'Made up.', document: 'D1', quote: 'Not in the source at all, anywhere.'},
    {kind: 'source', text: 'Unknown document.', document: 'D9', quote: 'Output rose for focused tasks.'},
    {kind: 'manifesto', text: 'Unknown kind.'}, {kind: 'angle', text: '   '}, null, 'junk']}));
  const out = J(L.validateIdeas(raw, {resolveDoc, have: ['Already on the board.']}));
  assert.deepEqual(out.map(c => c.kind), ['angle', 'question', 'source', 'source']);
  assert.equal(out[1].text, 'What would change your mind?');
  assert.deepEqual(out[2].src, {id: 's1', title: 'Smith (2024)', quote: 'Output rose for focused tasks.'});
  assert.equal(out[3].src.quote, 'Commutes fell by an hour a day');
  assert.equal(L.validateIdeas({cards: Array.from({length: 60}, (_, i) => ({kind: 'angle', text: 'Idea number ' + i}))}, {}).length, 16);
  assert.deepEqual(J(L.validateIdeas('nonsense', null)), []);
});

test('drafts line up by paragraph: unchanged ones match, edited ones pair up', () => {
  const A = ['a', 'b', 'c', 'd', 'e'], B = ['a', 'b2', 'c', 'x', 'y', 'e'];
  assert.deepEqual(J(L.alignParas(A, B)), [{a: 0, b: 0, same: true}, {a: 1, b: 1, same: false}, {a: 2, b: 2, same: true},
    {a: 3, b: 3, same: false}, {a: -1, b: 4, same: false}, {a: 4, b: 5, same: true}]);
  assert.deepEqual(J(L.alignParas([], ['a'])), [{a: -1, b: 0, same: false}]);
  assert.deepEqual(J(L.textParas('  One. \n\n\nTwo.\n  ')), ['One.', 'Two.']);
  assert.notEqual(L.paraHash('One.'), L.paraHash('One!'));
  assert.equal(L.noteKey('logic', '“A step,” she said…'), L.noteKey('logic', 'a step she said'));
  assert.equal(L.gist('Remote work saves time. It also costs mentoring.'), 'Remote work saves time.');
  assert.equal(L.gist('one two three four five six', 3), 'one two three…');
});

test('compareNotes sorts notes into fixed, still open, new and dismissed', () => {
  const A = [{k: 'logic:a'}, {k: 'clarity:b', m: 'applied'}, {k: 'grammar:c', m: 'dismissed'}, {k: 'evidence:d'}];
  const B = [{k: 'logic:a'}, {k: 'tension:e'}];
  const r = J(L.compareNotes(A, B));
  assert.deepEqual([r.fixed.map(x => x.k), r.open.map(x => x.k), r.added.map(x => x.k), r.dismissed.map(x => x.k)],
    [['clarity:b', 'evidence:d'], ['logic:a'], ['tension:e'], ['grammar:c']]);
});

test('recheckPlan reads changed paragraphs, their neighbours and what the last review tied to them', () => {
  const prev = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'];
  const cur = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'NEW8', 'p9', 'p10'];
  // the last review tied ¶8 to ¶2, so ¶2 is read in full as well
  assert.deepEqual(J(L.recheckPlan(prev, cur, [[8, 2], [4, 5]])), {changed: [8], full: [2, 7, 8, 9]});
  assert.equal(L.recheckPlan(prev, prev, []), null);                                   // nothing changed
  assert.equal(L.recheckPlan(prev.slice(0, 5), ['x', 'p2', 'p3', 'p4', 'p5'], []), null);   // too short to bother
  assert.equal(L.recheckPlan(prev, ['a', 'b', 'c', 'd', 'e', 'p6', 'p7', 'p8', 'p9', 'p10'], []), null);   // too much changed
});

test('validateRmap keeps real documents, known link kinds and passages that are really there', () => {
  const docs = {
    D1: {id: 'e1', title: 'Essay one', text: 'Creating is always better for God. So God must create.', claims: []},
    D2: {id: 'e2', title: 'Essay two', text: 'A merciful God might prefer not to create at all.', claims: []},
    D3: {id: 's1', title: 'A source', text: 'Activity is the most perfect state.', claims: [{id: 'c1', quote: 'Activity is the most perfect state.'}]}};
  const resolveDoc = ref => Object.prototype.hasOwnProperty.call(docs, ref) ? docs[ref] : null;
  const raw = JSON.parse(JSON.stringify({
    themes: [{name: 'God and creation', docs: ['D1', 'D2', 'D3', 'D1']}, {name: 'Repeats', docs: ['D2']}, {name: 'Nobody', docs: ['D9']}, {name: '', docs: ['D3']}],
    links: [
      {from: 'D1', to: 'D2', kind: 'Clash', from_quote: 'creating is always better for God', to_quote: 'prefer not to create at all', note: 'They disagree.', try: 'Limit the claim.'},
      {from: 'D3', to: 'D1', kind: 'supports', from_claim: 'c1', to_quote: 'So God must create.', note: 'Backs it up.', try: 'ignored'},
      {from: 'D1', to: 'D3', kind: 'cites', from_quote: 'So God must create.', note: 'Relies on it.'},
      {from: 'D2', to: 'D1', kind: 'clash', from_quote: 'A merciful God', to_quote: 'So God must create.'},
      {from: 'D1', to: 'D2', kind: 'supports', from_quote: 'Made up words that are nowhere.', to_quote: 'A merciful God'},
      {from: 'D1', to: 'D1', kind: 'clash', from_quote: 'So God', to_quote: 'So God'},
      {from: 'D1', to: 'D9', kind: 'cites', from_quote: 'So God'},
      {from: 'D1', to: 'D2', kind: 'loves', from_quote: 'So God', to_quote: 'A merciful God'}],
    threads: [{question: 'Is creating always better for God?', docs: ['D1', 'D2', 'D2'], note: 'They answer differently.'}, {question: 'Ghost', docs: ['D9']}, {question: '', docs: ['D1']}]}));
  const m = J(L.validateRmap(raw, {resolveDoc}));
  assert.deepEqual(m.themes, [{name: 'God and creation', docs: ['e1', 'e2', 's1']}]);
  assert.deepEqual(m.links.map(l => [l.from, l.to, l.kind]), [['e1', 'e2', 'clash'], ['s1', 'e1', 'supports'], ['e1', 's1', 'cites']]);
  assert.equal(m.links[0].qa, 'Creating is always better for God');
  assert.equal(m.links[0].fix, 'Limit the claim.');
  assert.equal(m.links[1].qa, 'Activity is the most perfect state.');
  assert.equal(m.links[1].fix, '');
  assert.equal(m.links[2].qb, null);
  assert.deepEqual(m.threads, [{q: 'Is creating always better for God?', docs: ['e1', 'e2'], note: 'They answer differently.'}]);
  assert.deepEqual(J(L.validateRmap('nonsense', {})), {themes: [], links: [], threads: []});
});

test('the prompt docs match the prompts the app sends', () => {
  const cfg = read('src/app/00-config.js');
  for (const [name, doc] of [['REVIEW_RULES', 'docs/review-prompt.md'], ['RECHECK_RULES', 'docs/review-prompt.md'], ['ARG_RULES', 'docs/argument-prompt.md'], ['IDEA_RULES', 'docs/brainstorm-prompt.md'], ['MAP_RULES', 'docs/map-prompt.md']]) {
    const rules = cfg.match(new RegExp('const ' + name + ' = `([\\s\\S]*?)`;'))[1];
    assert.ok(read(doc).includes(rules), 'run: npm run sync-prompt-doc');
  }
});
