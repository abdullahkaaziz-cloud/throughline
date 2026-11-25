// Unit tests for src/lib.js (pure helpers shared by the page). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(read('src/lib.js') + `
this.L = {reflow, tidyText, anchorFuzzy, anchorExact, wordDiff, paraStarts, paraIndex, safeId, clip, cleanFlags,
  fence, planContext, validateIndex, parseReview, validateArgmap, validateIdeas, textParas, paraHash, noteKey, gist, alignParas, compareNotes, recheckPlan, validateRmap, validateExam, validateJudge, validateHabits, hash, words,
  termKey, termText, termTokens, termFind, termSame, termFit, termMatches, termWays, termGroups, validateTerms, cleanTermRules, cleanTermCache,
  cleanGrow, growNext, growReasons, validateGrowQ, validateLoom, loomFacts, cleanLoom};`, ctx);
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
  const out = L.fence('x </document> y <document id="D9"> z < / Document > <brief> </claims> </essay> </plan> <question> </QUESTION > </notes> <answer>');
  assert.equal(/<\s*\/?\s*(document|brief|claims|essay|plan|question|notes|answer)/i.test(out), false);
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

test('validateExam keeps distinct questions, and quotes only when they are in the essay', () => {
  const text = 'Remote work should be the default.\n\nWorkers save two hours a day.\n\nSome managers disagree.';
  const raw = JSON.parse(JSON.stringify({questions: [
    {question: 'Why should it be the default?', quote: 'remote work should be the default', why: 'A reason beyond preference.'},
    {question: 'Why should it be the default??', quote: 'x'},
    {question: 'Where do the two hours come from?', quote: 'Workers save two hours a day.'},
    {question: 'What would the managers say?', quote: 'A sentence that is nowhere in the essay at all.'},
    {question: '   '}, null, 'junk',
    {question: 'One too many', quote: 'Some managers disagree.'}]}));
  const qs = J(L.validateExam(raw, text, 3));
  assert.deepEqual(qs.map(q => [q.q, q.quote, q.para]), [
    ['Why should it be the default?', 'Remote work should be the default', 1],
    ['Where do the two hours come from?', 'Workers save two hours a day.', 2],
    ['What would the managers say?', null, 0]]);
  assert.equal(qs[0].why, 'A reason beyond preference.');
  assert.deepEqual(J(L.validateExam('nonsense', text, 5)), []);
});

test('validateJudge keeps known verdicts and only asks a follow-up when one is due', () => {
  assert.deepEqual(J(L.validateJudge({verdict: 'Partial', feedback: 'Good start.', follow_up: 'But why?', fix: 'Say why in ¶2.'}, false)),
    {verdict: 'partial', feedback: 'Good start.', follow: 'But why?', fix: 'Say why in ¶2.'});
  assert.equal(L.validateJudge({verdict: 'strong', feedback: 'Clear.', follow_up: 'More?'}, false).follow, '');
  assert.equal(L.validateJudge({verdict: 'weak', feedback: 'Missed it.', follow_up: 'Again?'}, true).follow, '');
  assert.equal(L.validateJudge({verdict: 'brilliant', feedback: 'x'}, false), null);
  assert.equal(L.validateJudge({verdict: 'weak', feedback: ''}, false), null);
  assert.equal(L.validateJudge('nonsense', false), null);
});

test('validateHabits keeps habits backed by two real notes, with a known group', () => {
  const refs = Object.assign(Object.create(null), {N1: {g: 'evid'}, N2: {g: 'evid'}, N3: {g: 'logic'}, N4: {g: 'logic'}});
  const raw = {habits: [
    {title: 'Claims without a source', group: 'evid', detail: 'd', tip: 't', notes: ['N1', 'n2', 2, 'N1', 'N9']},
    {title: 'Skipped steps', group: '__proto__', detail: 'd', tip: 't', notes: ['N3', '4', 'N1']},
    {title: 'Only one real note', group: 'logic', notes: ['N3', 'N77']},
    {title: 'claims, without a SOURCE', group: 'evid', notes: ['N1', 'N2']},
    {title: '', group: 'evid', notes: ['N1', 'N2']},
    {title: 'Unknown group, unknown notes', group: 'x', notes: ['toString', 'constructor']},
    'not an object', null]};
  assert.deepEqual(J(L.validateHabits(raw, refs, 5)), [
    {title: 'Claims without a source', group: 'evid', detail: 'd', tip: 't', notes: ['N1', 'N2']},
    {title: 'Skipped steps', group: 'logic', detail: 'd', tip: 't', notes: ['N3', 'N4', 'N1']}]);
  assert.deepEqual(J(L.validateHabits({habits: [{title: 'A', group: 'gram', notes: ['N1', 'N2']}, {title: 'B', group: 'gram', notes: ['N3', 'N4']}]}, refs, 1)).map(x => x.title), ['A']);
  assert.deepEqual(J(L.validateHabits('nonsense', refs, 5)), []);
});

test('the prompt docs match the prompts the app sends', () => {
  const cfg = read('src/app/00-config.js');
  for (const [name, doc] of [['REVIEW_RULES', 'docs/review-prompt.md'], ['RECHECK_RULES', 'docs/review-prompt.md'], ['ARG_RULES', 'docs/argument-prompt.md'], ['IDEA_RULES', 'docs/brainstorm-prompt.md'], ['MAP_RULES', 'docs/map-prompt.md'], ['EXAM_RULES', 'docs/defend-prompt.md'], ['JUDGE_RULES', 'docs/defend-prompt.md'], ['HABIT_RULES', 'docs/progress-prompt.md'], ['TERM_RULES', 'docs/terms-prompt.md'], ['GROW_RULES', 'docs/grow-prompt.md'], ['LOOM_RULES', 'docs/loom-prompt.md']]) {
    const rules = cfg.match(new RegExp('const ' + name + ' = `([\\s\\S]*?)`;'))[1];
    assert.ok(read(doc).includes(rules), 'run: npm run sync-prompt-doc');
  }
});

// ---- consistent terms ----
const TERMS_TEXT = ['Email at Work',
  'We sent an e-mail to every co-operative. The email was short. E-mail is fast, and email is cheap.',
  'She wrote “send the e mail now” on the board. The e-mail’s subject was blank.',
  'Long-term plans matter in the long term. The Church and the church differ. Al-Ghazālī and al-Ghazali agree.',
  'The cooperative grew, and remote work spread. Working from home suits some; remote work suits others.'].join('\n\n');

test('termKey ignores capitals, accents, hyphens, apostrophes and spaces', () => {
  assert.equal(L.termKey('Al-Ghazālī'), 'alghazali');
  assert.equal(L.termKey('al ghazali'), 'alghazali');
  assert.equal(L.termKey('Qurʾān'), L.termKey("Qur'an"));
  assert.equal(L.termKey('Qur’an'), 'quran');
  assert.equal(L.termKey('E-mail'), L.termKey('e mail'));
  assert.notEqual(L.termKey('remote work'), L.termKey('remote worker'));
});

test('termText keeps one to four plain words', () => {
  assert.equal(L.termText('  working   from home '), 'working from home');
  assert.equal(L.termText('one two three four five'), '');
  assert.equal(L.termText('!!!'), '');
  assert.equal(L.termText('x'.repeat(80)), '');
  assert.equal(L.termText(null), '');
});

test('termTokens marks sentence starts, headings, quotations and possessives', () => {
  const t = L.termTokens(TERMS_TEXT), at = w => t.find(x => x.t === w);
  assert.ok(at('Email').head, 'a short line without a full stop is a heading');
  assert.ok(at('We').start && !at('sent').start);
  assert.ok(at('E-mail').start, 'after a full stop');
  assert.ok(at('send').quoted && at('mail').quoted && !at('board').quoted);
  const pos = t.find(x => x.t === 'e-mail’s');
  assert.equal(pos.kb, 'email'); assert.equal(TERMS_TEXT.slice(pos.s, pos.eb), 'e-mail');
  assert.ok(at('from').soft && !at('remote').soft === false);
});

test('termGroups finds a term written more than one way, and leaves out what is right both ways', () => {
  const g = J(L.termGroups(TERMS_TEXT, L.termTokens(TERMS_TEXT)));
  const ways = key => (g.find(x => x.key === key) || {ways: []}).ways.map(w => w.t + ':' + w.n);
  assert.deepEqual(ways('email'), ['e-mail:3', 'email:2'], 'a capital that starts a sentence joins the lowercase way; the quotation and the heading are left out');
  assert.deepEqual(ways('cooperative'), ['co-operative:1', 'cooperative:1']);
  assert.deepEqual(ways('alghazali'), ['al-Ghazālī:1', 'al-Ghazali:1'], 'accents count, and a sentence-start capital follows the others');
  assert.ok(!g.some(x => x.key === 'longterm'), 'a long-term plan, in the long term: both right');
  assert.ok(!g.some(x => x.key === 'church'), 'one plain word capitalised two ways is left to the writer');
  const open = J(L.termGroups('An all powerful king. The all-powerful king.', L.termTokens('An all powerful king. The all-powerful king.')));
  assert.equal(open.length, 1); assert.ok(open[0].open); assert.deepEqual(open[0].ways.map(w => w.t), ['all powerful', 'all-powerful']);
});

test('termMatches marks other spellings and other words, never the kept form or a quotation', () => {
  const t = L.termTokens(TERMS_TEXT), rules = [{keep: 'email', forms: []}, {keep: 'remote work', forms: ['working from home', 'telework']}];
  const m = J(L.termMatches(TERMS_TEXT, t, rules)).map(x => [x.t, x.how, x.fix]);
  assert.deepEqual(m, [['e-mail', 'spell', 'email'], ['E-mail', 'spell', 'Email'], ['e-mail', 'spell', 'email'], ['Working from home', 'word', 'Remote work']]);
  assert.ok(!m.some(x => x[0] === 'e mail'), 'quoted words are someone else’s');
  // the longest match wins, and a possessive stays outside it
  const s = 'The all powerful king’s court and the powerful king.';
  const mm = J(L.termMatches(s, L.termTokens(s), [{keep: 'all-powerful king', forms: []}, {keep: 'powerful', forms: ['strong']}]));
  assert.deepEqual(mm.map(x => x.t), ['all powerful king']);
});

test('termSame and termFit: capitals that only start a sentence or sit in a heading', () => {
  assert.ok(L.termSame('Email', 'email', true, false));
  assert.ok(!L.termSame('Email', 'email', false, false));
  assert.ok(L.termSame('Remote Work', 'remote work', false, true));
  assert.ok(L.termSame('Qur’an', "Qur'an", false, false), 'curly and straight apostrophes are one way');
  assert.equal(L.termFit('email', 'E-mail', true, false), 'Email');
  assert.equal(L.termFit('all-merciful', 'All Merciful', false, true), 'All-Merciful');
  assert.equal(L.termFit('Dostoevsky', 'dostoyevsky', false, false), 'Dostoevsky');
});

test('validateTerms keeps only forms the essay uses, each in one group', () => {
  const raw = {groups: [
    {label: 'Working away from the office', forms: ['remote work', 'Working from home', 'telecommuting'], keep: 'remote work'},
    {label: 'Same again', forms: ['remote work', 'working from home'], keep: 'remote work'},
    {label: 'Only one', forms: ['cooperative'], keep: 'cooperative'},
    {label: 'Two ways', forms: ['e-mail'], keep: 'email'},
    {label: 'Too long', forms: ['one two three four five', 'church'], keep: 'church'},
    'junk', {forms: 'not a list'}]};
  const g = J(L.validateTerms(raw, TERMS_TEXT));
  assert.deepEqual(g.map(x => x.label), ['Working away from the office', 'Only one', 'Two ways', 'Too long'], 'a repeated group and junk are dropped');
  assert.deepEqual(g[0].forms, ['remote work', 'Working from home'], 'a made-up form is dropped');
  assert.equal(g[0].keep, 'remote work');
  assert.deepEqual(g[0].ways.map(w => w.t + ':' + w.n), ['remote work:2', 'working from home:1']);
  assert.deepEqual(g[1].ways.map(w => w.t), ['co-operative', 'cooperative'], 'one term is enough when the essay writes it two ways');
  assert.deepEqual(g[2].ways.map(w => w.t), ['e-mail', 'email']);
  assert.deepEqual(g[3].forms, ['church'], 'a form of more than four words is dropped');
  assert.deepEqual(J(L.validateTerms({groups: [{forms: ['remote work', 'remote worker']}]}, TERMS_TEXT)), [], 'one way of one term is no group');
  assert.deepEqual(J(L.validateTerms({groups: [{forms: ['church', 'Church']}]}, TERMS_TEXT)).length, 1);
  assert.deepEqual(J(L.validateTerms(null, TERMS_TEXT)), []);
});

test('cleanTermRules keeps each term in one rule, and only well-formed data', () => {
  assert.equal(L.cleanTermRules({kind: 'doc'}), null);
  const r = J(L.cleanTermRules({kind: 'terms', rules: [
    {id: 'a1', keep: 'remote work', forms: ['working from home', 'Remote-work', 'telework', 'x'.repeat(90)], label: 'Work'},
    {id: 'a1', keep: 'Telework', forms: []},
    {id: 'r2', keep: 'phone', forms: []},
    {id: '__proto__', keep: 'email', forms: ['e-mail']},
    {keep: '<b>bold</b>', forms: []}, {keep: 'one two three four five'}, 'junk'],
    apart: ['email', 'a|b', 'bad key!', 7, 'email']}));
  assert.deepEqual(r.rules.map(x => [x.id, x.keep, x.forms]), [['a1', 'remote work', ['working from home', 'telework']], ['r2', 'phone', []], ['r3', 'email', []], ['r4', '<b>bold</b>', []]],
    'another spelling of a kept form needs no rule of its own; text stays text');
  assert.deepEqual(r.apart, ['email', 'a|b']);
  const c = J(L.cleanTermCache({sig: 'abc', at: 5, groups: [{label: 'L', forms: ['a b', ''], keep: 'zz'}, {forms: []}]}));
  assert.deepEqual(c, {sig: 'abc', at: 5, groups: [{label: 'L', keep: 'zz', forms: ['a b']}]});
  assert.equal(L.cleanTermCache({sig: ''}), null);
});

test('no two modules declare a function with the same name', () => {
  // The app's modules share one scope, so a second declaration silently replaces the first.
  const files = ['src/lib.js', ...readdirSync(new URL('src/app/', root)).filter(f => f.endsWith('.js')).sort().map(f => 'src/app/' + f)];
  const seen = new Map(), twice = [];
  for (const f of files) for (const m of read(f).matchAll(/^(?:async )?function\*? ?([A-Za-z0-9_$]+)/gm)) {
    if (seen.has(m[1])) twice.push(m[1] + ' (' + seen.get(m[1]) + ', ' + f + ')'); else seen.set(m[1], f);
  }
  assert.deepEqual(twice, []);
});

// ---- Grow ----
const answer = (G, p, k) => { const id = 'n' + (G.nodes.length + 1); G.nodes.push({id, p, k, q: '', a: 'answer ' + id, at: G.nodes.length + 1}); return id; };
test('growNext asks like a tutor: a reason, what you mean, the other side and a reply, then deeper', () => {
  const G = {root: 'Free transport', nodes: [], park: [], order: []}, seq = [];
  for (let i = 0; i < 9; i++) { const nx = L.growNext(G, null); seq.push((nx.p ? G.nodes.find(n => n.id === nx.p).k : 'root') + '>' + nx.k); answer(G, nx.p, nx.k); }
  assert.deepEqual(seq, ['root>why', 'root>mean', 'root>against', 'against>reply', 'root>follow', 'why>why', 'why>link', 'root>why', 'why>mean']);
});
test('growNext answers an objection first, skips parked questions, and follows the writer’s choice', () => {
  const G = {root: 'x', nodes: [], park: [], order: []};
  const r = answer(G, '', 'why'), o = answer(G, r, 'against');
  assert.deepEqual(J(L.growNext(G, null)), {p: o, k: 'reply'});
  G.park.push({id: 'q1', p: o, k: 'reply', q: '?'});
  assert.notDeepEqual(J(L.growNext(G, null)), {p: o, k: 'reply'}, 'a parked question waits');
  assert.equal(L.growNext(G, r).p, r, 'a chosen answer is the one asked about');
  const H = {root: 'x', nodes: [], park: [{id: 'q', p: '', k: 'mean', q: '?'}], order: []}; answer(H, '', 'why');
  assert.equal(L.growNext(H, null).k, 'mean', 'without a skip, what you mean is next');
  assert.equal(L.growNext(H, null, 'mean').k, 'against', 'after skipping it, another kind comes first');
  assert.equal(L.growNext(G, '').p, '', 'so is the starting thought');
  assert.equal(L.growNext({root: 'x', nodes: [], park: [{id: 'q', p: '', k: 'why', q: '?'}], order: []}, null), null, 'nothing left to ask');
});
test('growReasons keeps the writer’s order', () => {
  const G = {root: 'x', nodes: [], park: [], order: []};
  const a = answer(G, '', 'why'), b = answer(G, '', 'follow'); answer(G, '', 'mean'); const c = answer(G, '', 'why');
  assert.deepEqual(L.growReasons(G).map(n => n.id), [a, b, c]);
  G.order = [c, a];
  assert.deepEqual(L.growReasons(G).map(n => n.id), [c, a, b]);
});
test('cleanGrow keeps a well-formed tree and drops the rest', () => {
  const g = J(L.cleanGrow({root: 'Idea', line: 'One line', nodes: [
    {id: 'a', p: '', k: 'why', q: 'Why?', a: 'Because.', at: 1},
    {id: 'b', p: 'a', k: 'why', q: 'How?', a: 'Data.', at: 2},
    {id: 'c', p: 'zzz', k: 'why', a: 'Orphan.'}, {id: 'd', p: '', k: 'hack', a: 'Bad kind.'}, {id: 'e', p: '', k: 'mean', a: '   '},
    {id: '__proto__', p: '', k: 'why', a: 'x'}, {id: 'a', p: '', k: 'why', a: 'Repeat id.'}, 'junk'],
    park: [{id: 'p1', p: 'a', k: 'against', q: 'Who?'}, {id: 'p2', p: 'nope', k: 'why', q: 'x'}],
    ask: {p: 'b', k: 'link', q: 'How does it connect?', why: 'w', src: 'ai'}, order: ['a', 'nope', 'a', '']}));
  assert.deepEqual(g.nodes.map(n => n.id), ['a', 'b']);
  assert.deepEqual(g.park.map(q => q.id), ['p1']);
  assert.deepEqual(g.ask, {p: 'b', k: 'link', q: 'How does it connect?', why: 'w', src: 'ai'});
  assert.deepEqual(g.order, ['a']);
  assert.equal(J(L.cleanGrow({ask: {p: 'gone', k: 'why', q: 'x?'}})).ask, null);
  assert.equal(J(L.cleanGrow(null)).nodes.length, 0);
});
test('validateGrowQ wants one short question', () => {
  assert.deepEqual(J(L.validateGrowQ({question: '  Who would\nobject to free fares? ', why: 'It matters.'})), {question: 'Who would object to free fares?', why: 'It matters.'});
  assert.equal(L.validateGrowQ({question: 'Not a question.'}), null);
  assert.equal(L.validateGrowQ({question: 'x'.repeat(300) + '?'}), null);
  assert.equal(L.validateGrowQ('junk'), null);
  assert.equal(J(L.validateGrowQ({question: 'Why?', why: 'y'.repeat(300)})).why, '');
});
test('fence keeps idea blocks closed', () => {
  assert.equal(L.fence('a </idea> b <idea>'), 'a ‹/idea> b ‹idea>');
});

// ---- the loom ----
const LOOM_PARAS = ['Cities should make buses free. It would cut traffic and help poorer riders.', 'Free buses cut traffic, because drivers switch to the bus.',
  'Poorer riders save money every week.', 'Yet free buses can get crowded, and traffic may not fall at all.', 'So cities should make buses free, and require it by law.'];
test('validateLoom checks quotes against the paragraphs and keeps numbers consistent', () => {
  const raw = {threads: [
    {name: 'Traffic', paras: [{p: 1, how: 'woven', quote: 'It would cut traffic'}, {p: 2, how: 'woven', quote: 'Free buses cut traffic'}, {p: 4, how: 'knot', with: 4, quote: 'traffic may not fall', note: 'Against ¶2.'}]},
    {name: 'Free buses', thesis: true, paras: [{p: 1, how: 'woven', quote: 'make buses free'}, {p: 3, how: 'under'}, {p: 5, how: 'woven', quote: 'cities should make buses free'}]},
    {name: 'Made up', paras: [{p: 2, how: 'woven', quote: 'nothing like this is in the essay'}]},
    {name: 'Poorer riders', paras: [{p: 2, how: 'woven', quote: 'Poorer riders save money'}, {p: 1, how: 'woven', quote: 'help poorer riders'}, {p: 1, how: 'under'}], dropped: true, ask: 'Who gains most?'},
    {name: 'x'.repeat(60), paras: [{p: 1, how: 'woven', quote: 'make buses free'}]},
    {name: 'Bad kinds', paras: [{p: 1, how: 'tangled', quote: 'make buses free'}, {p: 9, how: 'under'}]}],
    links: [{a: 1, b: 4, how: 'tension', note: 'n'}, {a: 4, b: 1, how: 'tension'}, {a: 3, b: 1, how: 'supports'}, {a: 2, b: 2, how: 'supports'}, {a: 1, b: 2, how: 'loves'}]};
  const v = J(L.validateLoom(raw, LOOM_PARAS, 5));
  assert.deepEqual(v.threads.map(t => t.name), ['Free buses', 'Traffic', 'Poorer riders'], 'the thesis first; made-up, over-long and empty threads dropped');
  assert.deepEqual(v.threads[2].paras.map(e => e.p + e.how), ['1woven', '3woven'], 'a quote moves its place to the paragraph it is really in; woven beats under');
  assert.equal(v.threads[1].paras[2].with, 3, 'a knot keeps pointing at the same thread after renumbering');
  assert.deepEqual(v.links, [{a: 2, b: 3, how: 'tension', note: 'n'}], 'links are renumbered, and bad or repeated ones dropped');
  assert.deepEqual(J(L.validateLoom(v, LOOM_PARAS, 5)), v, 'checking again changes nothing');
  assert.equal(L.validateLoom(v, LOOM_PARAS.slice(1), 5).threads[0].paras.find(e => e.how === 'woven').p, 4, 'places follow their quotes when paragraphs move');
  assert.deepEqual(J(L.validateLoom('junk', LOOM_PARAS)), {threads: [], links: []});
});
test('loomFacts finds loose ends and ideas new in the conclusion', () => {
  const v = L.validateLoom({threads: [
    {name: 'Free buses', thesis: true, paras: [{p: 1, how: 'woven', quote: 'make buses free'}, {p: 5, how: 'woven', quote: 'cities should make buses free'}]},
    {name: 'Poorer riders', dropped: true, paras: [{p: 1, how: 'woven', quote: 'help poorer riders'}, {p: 3, how: 'woven', quote: 'Poorer riders save money'}]},
    {name: 'Traffic', dropped: true, paras: [{p: 2, how: 'woven', quote: 'Free buses cut traffic'}, {p: 5, how: 'under'}, {p: 4, how: 'knot', quote: 'traffic may not fall'}]},
    {name: 'The law', paras: [{p: 5, how: 'woven', quote: 'require it by law'}]}]}, LOOM_PARAS, 5);
  const f = J(L.loomFacts(v, 5, []));
  assert.deepEqual(f.map(x => [x.first, x.last, x.knots, x.loose, x.fresh]), [[0, 4, 0, false, false], [0, 2, 0, true, false], [1, 3, 1, true, false], [4, 4, 0, false, true]]);
  assert.equal(J(L.loomFacts(v, 5, ['Poorer riders']))[1].loose, false, 'a thread the writer meant to drop is not flagged');
});
test('cleanLoom keeps a stored loom, checked against the essay it was stored with', () => {
  const c = J(L.cleanLoom({sig: 'abc', at: 3, threads: [{name: 'Traffic', paras: [{p: 2, how: 'woven', quote: 'Free buses cut traffic'}]}], keep: ['Traffic', 7, 'x'.repeat(50)]}, LOOM_PARAS));
  assert.deepEqual([c.sig, c.threads.length, c.keep], ['abc', 1, ['Traffic']]);
  assert.equal(L.cleanLoom({threads: []}, LOOM_PARAS), null);
});
