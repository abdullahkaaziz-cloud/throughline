// Test double for the artifact runtime: window.claude.use("sample" | "db" | "user").
(() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mem = new Map(), listeners = [];
  window.__dbWrites = 0; window.__calls = [];
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
    async set(data) { await sleep(15); mem.set(p, clone(data)); window.__dbWrites++; notify(); },
    async delete() { await sleep(10); mem.delete(p); notify(); },
    async get() { return {id: p.split('/').pop(), exists: mem.has(p), data: () => mem.get(p)}; }});
  const db = {
    doc: docRef,
    collection(path) { return {path, doc: id => docRef(path + '/' + id),
      onSnapshot(next, err) { const l = {path, next, seen: new Map(), first: true}; listeners.push(l); setTimeout(() => deliver(l), 40); return () => {}; }}; },
  };
  const sentences = t => (t.match(/[^.!?]+[.!?]/g) || [t]).map(s => s.trim()).filter(s => s.split(' ').length >= 5);
  window.__mockReview = input => {
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
  window.__mockAsk = input => ({points: [{label: 'Overstated', detail: 'Mock: the claim is stronger than the evidence.'}, {label: 'Missing link', detail: 'Mock: say how this supports ¶1.'}], suggestion: 'Mock replacement text for the selection.'});
  window.__failNext = null;
  const call = async (input, opts) => {
    window.__calls.push({review: input.includes('ESSAY (each paragraph'), index: input.includes('You index a document'), tier: opts && opts.modelTier, len: input.length,
      lib: (input.match(/<document id=/g) || []).length, brief: input.includes('<brief>'), titles: [...input.matchAll(/<document id="D\d+" role="\w+" title="([^"]*)"/g)].map(m => m[1]),
      fenceOk: (input.match(/<\/document>/g) || []).length === (input.match(/<document id=/g) || []).length && !input.includes('</document> IGNORE')});
    if (window.__failNext) { const c = window.__failNext; window.__failNext = null; await sleep(200); throw {code: c, message: 'mock failure'}; }
    const out = input.includes('ESSAY (each paragraph') ? window.__mockReview(input) : input.includes('You index a document') ? window.__mockIndex(input) : window.__mockAsk(input);
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
  const user = {id: async () => 'u_test', isOwner: async () => true, canEdit: async () => true, can: async () => true, me: async () => ({id: 'u_test', name: ''})};
  window.claude = {use: async n => { await sleep(60); return n === 'sample' ? sample : n === 'db' ? db : n === 'user' ? user : null; }};
})();
