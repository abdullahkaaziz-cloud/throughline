// Test double for the artifact runtime: window.claude.use("sample" | "db" | "user").
(() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mem = new Map(), listeners = [];
  // window.__seedDb ({path: record}), set by an earlier init script, starts the store with records already in it.
  for (const [p, v] of Object.entries(window.__seedDb || {})) mem.set(p, JSON.parse(JSON.stringify(v)));
  // window.__dbPut(path, record) adds a record while the page is open, as another device would.
  window.__dbPut = (p, v) => { mem.set(p, JSON.parse(JSON.stringify(v))); notify(); };
  window.__dbWrites = 0; window.__calls = [];
  window.__dbDump = () => [...mem.values()].map(clone);
  const clone = x => JSON.parse(JSON.stringify(x));
  function snapFor(l) {
    const docs = [];
    for (const [p, data] of mem) {
      if (!p.startsWith(l.path + '/')) continue;
      const id = p.slice(l.path.length + 1); if (id.includes('/')) continue;
      docs.push({id, exists: true, data: () => Object.freeze(clone(data)), metadata: {fromCache: false, hasPendingWrites: false}, _json: JSON.stringify(data)});
    }
    const changes = [];
    for (const d of docs) { const old = l.seen.get(d.id); if (old !== d._json) changes.push({type: old ? 'modified' : 'added', doc: d}); }
    for (const id of [...l.seen.keys()]) if (!docs.find(d => d.id === id)) changes.push({type: 'removed', doc: {id, exists: true, data: () => ({})}});
    l.seen = new Map(docs.map(d => [d.id, d._json]));
    return {docs, size: docs.length, empty: !docs.length, docChanges: () => changes, metadata: {fromCache: false, hasPendingWrites: false}};
  }
  const deliver = l => { const s = snapFor(l); if (l.first || s.docChanges().length || true) { l.first = false; l.next(s); } };
  const notify = () => { for (const l of listeners) setTimeout(() => deliver(l), 10); };
  const docRef = p => ({id: p.split('/').pop(), path: p,
    async set(data) { await sleep(15); if (window.__dbDeny) throw {code: 'permission_denied', message: 'mock: view only'}; mem.set(p, clone(data)); window.__dbWrites++; notify(); },
    async delete() { await sleep(10); mem.delete(p); notify(); },
    async get() { return {id: p.split('/').pop(), exists: mem.has(p), data: () => mem.get(p)}; }});
  const db = {
    doc: docRef,
    collection(path) { return {path, doc: id => docRef(path + '/' + id),
      onSnapshot(next, err) {
        // window.__dbDeny plays a viewer who may only look: reading their space is refused, as the real rules would.
        if (window.__dbDeny) { setTimeout(() => err && err({code: 'permission_denied', message: 'mock: view only'}), 40); return () => {}; }
        const l = {path, next, seen: new Map(), first: true}; listeners.push(l); setTimeout(() => deliver(l), 40); return () => {}; }}; },
  };
  const sentences = t => (t.match(/[^.!?]+[.!?]/g) || [t]).map(s => s.trim()).filter(s => s.split(' ').length >= 5);
  window.__mockReview = input => {
    // A re-check: one note on the first starred (changed) paragraph, and one on an unchanged paragraph the app must drop.
    if (input.includes('THIS IS A RE-CHECK')) {
      const starred = [...input.matchAll(/^\[(\d+)\*\] (.+)$/gm)].map(m => m[2]), plain = [...input.matchAll(/^\[(\d+)\] (?!\(in short\))(.+)$/gm)].map(m => m[2]);
      const issues = [];
      if (starred.length) issues.push({type: 'clarity', severity: 'medium', confidence: 0.8, title: 'Mock re-check: the new wording is hard to follow', passage_a: {quote: sentences(starred[0])[0]}, passage_b: null, explanation: 'Mock re-check.', fix: 'Mock fix.', suggestion: null});
      if (plain.length) issues.push({type: 'grammar', severity: 'low', confidence: 0.9, title: 'Out of scope: an unchanged paragraph', passage_a: {quote: sentences(plain[0])[0]}, passage_b: null, explanation: 'x', fix: 'x', suggestion: null});
      return {summary: {}, brief: [], issues, links: []};
    }
    const paras = [...input.matchAll(/^\[(\d+)\] (.+)$/gm)].map(m => m[2]).filter(p => p.split(' ').length > 12);
    const first = i => sentences(paras[Math.min(i, paras.length - 1)] || '')[0] || '';
    const docs = [...input.matchAll(/<document id="(D\d+)" role="(\w+)" title="([^"]*)" content="([^"]*)">\n([\s\S]*?)\n<\/document>/g)]
      .map(m => ({id: m[1], role: m[2], title: m[3], mode: m[4], body: m[5]}));
    const curly = s => s.replace(/'/g, '\u2019');
    const pick = d => {
      if (d.mode === 'main claims only') { const m = d.body.match(/^(c\d+): .*\n\s+"(.*)"$/m); return m ? {claim: m[1], quote: m[2]} : null; }
      const q = sentences(d.body.split('\n').find(l => l.split(' ').length > 15) || d.body)[0];
      return q ? {quote: q} : null;
    };
    const issues = [
      {type: 'contradiction', severity: 'high', confidence: 0.9, title: 'Two claims pull against each other', passage_a: {quote: curly(first(1))}, passage_b: {quote: first(3), document: null}, explanation: 'Mock: these two sentences seem to disagree.', fix: 'Mock: qualify one of them.', suggestion: null},
      {type: 'logic', severity: 'medium', confidence: 0.7, title: 'A step is missing', passage_a: {quote: first(0)}, passage_b: null, explanation: 'Mock: the reasoning skips a step.', fix: 'Mock: add the missing step.', suggestion: null},
      {type: 'evidence', severity: 'medium', confidence: 0.75, title: 'Needs a source', passage_a: {quote: first(2).replace(/\.$/, '')}, passage_b: null, explanation: 'Mock: cite something.', fix: 'Mock: add a citation.', suggestion: null},
      {type: 'clarity', severity: 'low', confidence: 0.6, title: 'Hard to follow', passage_a: {quote: '... ' + first(4).split(' ').slice(0, 9).join(' ') + ' ...'}, passage_b: null, explanation: 'Mock: long sentence.', fix: 'Mock: split it.', suggestion: null},
      {type: 'grammar', severity: 'low', confidence: 0.9, title: 'Small slip', passage_a: {quote: first(2).split(' ').slice(0, 4).join(' ')}, passage_b: null, explanation: 'Mock grammar.', fix: 'Mock fix.', suggestion: first(2).split(' ').slice(0, 4).join(' ').toUpperCase()},
      {type: 'logic', severity: 'high', confidence: 0.9, title: 'Made-up quote that must be dropped', passage_a: {quote: 'This sentence does not appear anywhere in the essay at all.'}, explanation: 'x', fix: 'x'},
    ];
    const links = [], essay = docs.find(d => d.role === 'essay'), src = docs.find(d => d.role === 'source');
    if (essay) { const p = pick(essay); if (p) issues.push({type: 'library_clash', severity: 'medium', confidence: 0.7, title: 'Clashes with an earlier essay', passage_a: {quote: first(5)}, passage_b: Object.assign({document: essay.id}, p), explanation: 'Mock: your earlier essay says otherwise.', fix: 'Mock: reconcile them.', suggestion: null}); }
    if (src) {
      const p = pick(src);
      if (p) {
        issues.push({type: 'source_conflict', severity: 'high', confidence: 0.8, title: 'A source says otherwise', passage_a: {quote: first(3)}, passage_b: Object.assign({document: src.id}, p), explanation: 'Mock: the source disagrees.', fix: 'Mock: answer the source.', suggestion: null});
        issues.push({type: 'citation', severity: 'medium', confidence: 0.7, title: 'Citation not backed up', passage_a: {quote: first(4)}, passage_b: null, explanation: 'Mock: the cited source does not say this.', fix: 'Mock: check the citation.', suggestion: null});
        links.push({quote: first(0), document: src.id, claim: p.claim || null, source_quote: p.claim ? null : p.quote, relation: 'supports'});
        links.push({quote: first(1), document: src.id, source_quote: p.quote, relation: 'contradicts'});
      }
    }
    const brief = input.includes('<brief>') ? [
      {requirement: 'State a clear position', status: 'covered', quote: first(0), note: 'Mock: clear thesis.'},
      {requirement: 'Use evidence', status: 'partial', quote: null, note: 'Mock: some claims lack sources.'},
      {requirement: 'Answer objections', status: 'missing', quote: null, note: 'Mock: no counterargument.'}] : [];
    return {summary: {thesis: 'Mock thesis for this essay.', start_with: 'Mock: start with the contradiction.'}, brief, issues, links};
  };
  window.__mockIndex = input => {
    const m = input.match(/<document>\n([\s\S]*?)\n<\/document>/), ss = sentences(m ? m[1] : '').slice(0, 3);
    return {meta: {authors: 'A. Author', year: '2024', summary: 'Mock summary of the document.'}, claims: ss.map((q, i) => ({claim: 'Claim ' + (i + 1) + ' in plain words.', quote: q, topic: 'topic ' + (i + 1)}))};
  };
  // Argument map: one entry per numbered paragraph, plus entries the app must drop (out of range, duplicate, unknown kind).
  window.__mockArgmap = input => {
    const ps = [...input.matchAll(/^\[(\d+)\] (.+)$/gm)].map(m => ({n: +m[1], t: m[2]})), last = ps.length;
    const role = i => i === 0 ? 'thesis' : i === last - 1 ? 'conclusion' : ['claim', 'evidence', 'counter', 'rebuttal', 'claim'][(i - 1) % 5];
    const paras = ps.map((p, i) => ({para: p.n, role: role(i), point: i === 1 ? '<img src=x onerror="window.__pwned=1">' : 'Mock point ' + p.n, thread: [1, 0.9, 0.75, 0.3, 0.7][i % 5],
      supports: role(i) === 'claim' ? [1, p.n] : role(i) === 'evidence' ? [p.n - 1] : [], answers: role(i) === 'rebuttal' ? [p.n - 1] : []}));
    paras.push({para: 9999, role: 'claim', point: 'out of range'}, {para: 2, role: 'claim', point: 'duplicate'}, {para: 3, role: 'villain', point: 'unknown role'});
    const first = ps.length ? (ps[0].t.match(/[^.!?]+[.!?]/) || [ps[0].t])[0].trim() : '';
    return {thesis: {text: 'Mock thesis.', quote: first}, paras,
      problems: [{kind: 'gap', paras: [2, 3], note: 'Mock: a step is missing.'}, {kind: 'bogus', paras: [1], note: 'x'}, {kind: 'dropped', paras: [1, 4242], note: 'Mock: promised, never argued.'}]};
  };
  // Brainstorm cards: some of each kind, plus ones the app must drop (unknown kind, a repeat, a made-up source quote).
  window.__mockIdeas = input => {
    const round = (input.match(/^- \(/gm) || []).length ? 2 : 1, cards = [
      {kind: 'angle', text: 'Mock angle ' + round + ': look at who gains most.'},
      {kind: 'angle', text: 'Mock angle ' + round + ': compare before and after.'},
      {kind: 'objection', text: 'Mock objection ' + round + ': the costs fall on someone else.'},
      {kind: 'question', text: 'Mock question ' + round + ': what would change your mind?'},
      {kind: 'angle', text: 'Mock angle ' + round + ': look at who gains most!'},
      {kind: 'wild', text: 'Unknown kind of card.'},
      {kind: 'source', text: 'Made-up quote.', document: 'D1', quote: 'This sentence is in no document at all, anywhere.'}];
    const doc = input.match(/<document id="(D\d+)" role="source"[^>]*content="([^"]*)">\n([\s\S]*?)\n<\/document>/);
    if (doc) {
      const m = doc[2] === 'main claims only' ? doc[3].match(/^(c\d+): .*\n\s+"(.*)"$/m) : null, q = m ? m[2] : (doc[3].match(/[^.!?]+[.!?]/) || [''])[0].trim();
      cards.push({kind: 'source', text: 'Mock: this source speaks to the question.', document: doc[1], claim: m ? m[1] : null, quote: q});
    }
    return {cards};
  };
  // Research map: two themes, a clash between the first two essays, a source that supports an essay, a citation,
  // and links and threads the app must drop (unknown document, made-up quote, unknown kind).
  window.__mockRmap = input => {
    const docs = [...input.matchAll(/<document id="(D\d+)" role="(\w+)" title="([^"]*)" content="([^"]*)">\n([\s\S]*?)\n<\/document>/g)]
      .map(m => ({id: m[1], role: m[2], mode: m[4], body: m[5]}));
    const pick = d => {
      if (d.mode === 'main claims only') { const m = d.body.match(/^(c\d+): .*\n\s+"(.*)"$/m); return m ? {claim: m[1], quote: m[2]} : {}; }
      return {quote: sentences(d.body.split('\n').find(l => l.split(' ').length > 8) || d.body)[0]};
    };
    const E = docs.filter(d => d.role === 'essay'), S = docs.filter(d => d.role === 'source'), links = [];
    if (E.length > 1) { const a = pick(E[0]), b = pick(E[1]); links.push({from: E[0].id, to: E[1].id, kind: 'clash', from_claim: a.claim, from_quote: a.quote, to_claim: b.claim, to_quote: b.quote, note: 'Mock: these two essays disagree.', try: 'Mock: narrow one of the claims.'}); }
    if (S.length && E.length) {
      const a = pick(S[0]), b = pick(E[0]);
      links.push({from: S[0].id, to: E[0].id, kind: 'supports', from_claim: a.claim, from_quote: a.quote, to_claim: b.claim, to_quote: b.quote, note: 'Mock: the source backs the essay up.'});
      links.push({from: E[0].id, to: S[0].id, kind: 'cites', from_claim: b.claim, from_quote: b.quote, note: 'Mock: the essay relies on the source.'});
    }
    if (E.length) links.push({from: E[0].id, to: 'D99', kind: 'cites', from_quote: 'x'}, {from: E[0].id, to: (E[1] || S[0] || E[0]).id, kind: 'supports', from_quote: 'Words that appear in no document anywhere at all.', to_quote: 'More words that appear nowhere.'}, {from: E[0].id, to: (E[1] || S[0] || E[0]).id, kind: 'adores', from_quote: 'x', to_quote: 'y'});
    return {themes: [{name: 'Mock theme: your essays', docs: E.map(d => d.id)}, {name: 'Mock theme: sources', docs: S.map(d => d.id).concat(['D99'])}, {name: 'Ghosts', docs: ['D99']}], links,
      threads: [{question: 'Mock: is the open question ever settled?', docs: E.slice(0, 2).map(d => d.id), note: 'Mock: the essays answer differently.'}, {question: 'Mock ghost thread', docs: ['D99']}]};
  };
  // A viva: one question per paragraph (plus a repeat to drop); answers with "because" are strong, empty ones weak,
  // the rest partial with a follow-up.
  window.__mockExam = input => {
    const n = +((input.match(/Ask (\d+) questions/) || [])[1] || 5), ps = [...input.matchAll(/^\[(\d+)\] (.+)$/gm)].map(m => m[2]);
    const qs = ps.slice(0, n).map((p, i) => ({question: 'Mock question ' + (i + 1) + ': why do you claim this?', quote: sentences(p)[0] || p, why: 'Mock: a reason the essay supports.'}));
    return {questions: qs.concat([{question: 'Mock question 1: why do you claim this?', quote: 'x'}])};
  };
  window.__mockJudge = input => {
    const ans = (input.match(/ANSWER:\n<answer>\n([\s\S]*?)\n<\/answer>$/) || [])[1] || '', follow = input.includes('(a follow-up)');
    if (/because/i.test(ans)) return {verdict: 'strong', feedback: 'Mock: a clear reason.', follow_up: 'This must be ignored.', fix: ''};
    if (!ans.trim() || ans === '(no answer)') return {verdict: 'weak', feedback: 'Mock: no answer.', follow_up: 'Mock follow-up: can you try?', fix: ''};
    return {verdict: 'partial', feedback: 'Mock: on the right track.', follow_up: follow ? 'This must be ignored too.' : 'Mock follow-up: but why exactly?', fix: 'Mock: give the reason in the essay.'};
  };
  window.__mockAsk = input => ({points: [{label: 'Overstated', detail: 'Mock: the claim is stronger than the evidence.'}, {label: 'Missing link', detail: 'Mock: say how this supports ¶1.'}], suggestion: 'Mock replacement text for the selection.'});
  // Habits: cite the first two notes and the last one; one habit cites a made-up note, one has an unknown group.
  window.__mockHabits = input => {
    const ids = [...input.matchAll(/^(N\d+) \[/gm)].map(m => m[1]), last = ids[ids.length - 1];
    return {habits: [
      {title: 'Claims without a source behind them', group: 'evid', detail: 'Mock: you state findings without saying where they come from.', tip: 'Mock: cite as you write.', notes: [ids[0], ids[1], last]},
      {title: 'Steps left out of the argument', group: 'mystery', detail: 'Mock: the group is unknown, so it comes from the notes.', tip: 'Mock: say why each step follows.', notes: [ids[1], last]},
      {title: 'Backed by a made-up note only', group: 'logic', detail: 'x', tip: 'x', notes: ['N9999', ids[0]]},
      {title: 'claims WITHOUT a source behind them!', group: 'evid', detail: 'A repeat.', tip: 'x', notes: [ids[0], ids[1]]}]};
  };
  // Terms: one group with a made-up form, one term written two ways, a group of made-up forms only, and one whose
  // forms are markup or already taken.
  window.__mockTerms = input => ({groups: [
    {label: 'Not charging fares', forms: ['free public transport', 'zero-fare travel', 'fare-free public transport', 'gratis transit'], keep: 'free public transport'},
    {label: 'Email', forms: ['email', 'e-mail'], keep: 'email'},
    {label: 'Made up', forms: ['gratis transit', 'no-cost metro'], keep: 'gratis transit'},
    {label: '<b>bold</b>', forms: ['<img src=x onerror=window.__pwned=1>', 'free public transport'], keep: 'x'}]});
  window.__failNext = null;
  const call = async (input, opts) => {
    window.__calls.push({review: input.includes('ESSAY (each paragraph'), index: input.includes('You index a document'), arg: input.includes('You map the argument'), ideas: input.includes('You help a writer brainstorm'), rmap: input.includes('You map how a writer'), docs: (input.match(/<document id=/g) || []).length,
      habits: input.includes('looking across one writer'), terms: input.includes('You check one essay for terms'), recheck: input.includes('THIS IS A RE-CHECK'), exam: input.includes('You are an examiner holding'), judge: input.includes('Judge their answer'),
      answerClose: (input.match(/<\/answer>/g) || []).length, notesClose: (input.match(/<\/notes>/g) || []).length, starred: (input.match(/^\[\d+\*\] /gm) || []).length,
      essayLen: input.includes('\n\nESSAY (') ? input.slice(input.indexOf('\n\nESSAY ('), input.indexOf('OTHER DOCUMENTS')).length : 0,
      questionClose: (input.match(/<\/question>/g) || []).length, planClose: (input.match(/<\/plan>/g) || []).length,
      essayClose: (input.match(/<\/essay>/g) || []).length, tier: opts && opts.modelTier, len: input.length,
      lib: (input.match(/<document id=/g) || []).length, brief: input.includes('<brief>'), titles: [...input.matchAll(/<document id="D\d+" role="\w+" title="([^"]*)"/g)].map(m => m[1]),
      fenceOk: (input.match(/<\/document>/g) || []).length === (input.match(/<document id=/g) || []).length && !input.includes('</document> IGNORE')});
    if (window.__failNext) { const c = window.__failNext; window.__failNext = null; await sleep(200); throw {code: c, message: 'mock failure'}; }
    const out = input.includes('You check one essay for terms') ? window.__mockTerms(input) : input.includes('looking across one writer') ? window.__mockHabits(input) : input.includes('Judge their answer') ? window.__mockJudge(input) : input.includes('You are an examiner holding') ? window.__mockExam(input) : input.includes('You map how a writer') ? window.__mockRmap(input) : input.includes('You help a writer brainstorm') ? window.__mockIdeas(input) : input.includes('You map the argument') ? window.__mockArgmap(input) : input.includes('ESSAY (each paragraph') ? window.__mockReview(input) : input.includes('You index a document') ? window.__mockIndex(input) : window.__mockAsk(input);
    const txt = JSON.stringify(out);
    await sleep(400);
    if (opts && opts.signal && opts.signal.aborted) throw {code: 'cancelled', message: 'stopped'};
    if (opts && opts.onText) { opts.onText({text: txt.slice(0, txt.length >> 1), delta: txt.slice(0, txt.length >> 1)}); await sleep(400); opts.onText({text: txt, delta: txt.slice(txt.length >> 1)}); }
    if (opts && opts.signal && opts.signal.aborted) throw {code: 'cancelled', message: 'stopped'};
    return txt;
  };
  const sample = async (input, opts) => ({text: await call(input, opts), truncated: false});
  sample.json = async (input, opts) => JSON.parse(await call(input, opts));
  sample.limits = async () => ({maxPromptBytes: 262144, modelTiers: ['default', 'complex', 'quick']});
  // window.__notOwner plays a tester the app was shared with; window.__myName is their display name.
  const user = {id: async () => 'u_test', isOwner: async () => !window.__notOwner, canEdit: async () => true, can: async () => true, me: async () => ({id: 'u_test', name: window.__myName || ''})};
  // Voice and downloads: speaking records what was said; dictation "hears" window.__dictText; saves record the file.
  window.__spoken = []; window.__saved = [];
  const tts = {speak: async t => { window.__spoken.push(String(t)); await sleep(30); }, stop() {}, onState() { return () => {}; }};
  const dictation = (() => {
    const fin = [], par = [], sta = []; let on = false;
    return {start: async () => { on = true; sta.forEach(f => f({state: 'listening'}));
        setTimeout(() => par.forEach(f => f({text: 'because the'})), 40);
        setTimeout(() => { fin.forEach(f => f({text: window.__dictText || 'Because the evidence shows it.'})); par.forEach(f => f({text: ''})); }, 100); },
      stop: async () => { if (on) { on = false; sta.forEach(f => f({state: 'idle', reason: 'stopped'})); } },
      active: () => on, onFinal: f => { fin.push(f); return () => {}; }, onPartial: f => { par.push(f); return () => {}; }, onState: f => { sta.push(f); return () => {}; }};
  })();
  // window.__saveFail = 'some_code' makes the next save fail with that code, as the real runtime would.
  const downloads = {save: async ({filename, data}) => { if (window.__saveFail) { const code = window.__saveFail; window.__saveFail = null; throw {code, message: code}; } window.__saved.push({filename, size: typeof data === 'string' ? data.length : (data.size || data.byteLength || 0), text: typeof data === 'string' ? data : ''}); return {status: 'saved'}; }};
  window.claude = {use: async n => { await sleep(60); return n === 'sample' ? sample : n === 'db' ? db : n === 'user' ? user : n === 'tts' ? tts : n === 'dictation' ? dictation : n === 'downloads' ? downloads : null; }};
})();
