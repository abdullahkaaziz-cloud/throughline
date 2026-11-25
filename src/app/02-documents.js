// ---- documents: essays (your writing) and sources (papers you use) ----
// Everything read back from storage passes through fromStored(), which keeps only known fields,
// known values and bounded sizes, so a tampered or corrupted record can't break or script the page.
const newId = () => 'e' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
function makeDoc(title, text, role) {
  const now = Date.now();
  return {id: newId(), role: role === 'source' ? 'source' : 'essay', title: title || '', text: text || '', review: null,
    marks: Object.create(null), brief: null, use: Object.create(null), index: null, argmap: null, plan: null, history: null, defences: null, activity: null, terms: null, createdAt: now, updatedAt: now};
}
function makeSample() {
  return Object.assign(makeDoc('Should remote work become the default?', SAMPLE_TEXT),
    {id: 'sample', isSample: true, unsaved: true, review: cleanReview(JSON.parse(JSON.stringify(SAMPLE_REVIEW))),
      argmap: cleanArgmap(Object.assign({at: 0, hash: hash(SAMPLE_TEXT), n: paraStarts(SAMPLE_TEXT).length}, JSON.parse(JSON.stringify(SAMPLE_ARGMAP)))), createdAt: 0, updatedAt: 0});
}
function sortedDocs() { return [...st.docs.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); }
function essayDocs() { return sortedDocs().filter(d => d.role !== 'source'); }
function sourceDocs() { return sortedDocs().filter(d => d.role === 'source'); }
function serial(d) {
  const body = {kind: 'doc', v: 2, role: d.role === 'source' ? 'source' : 'essay', title: d.title || '', text: d.text || '',
    review: d.review || null, marks: Object.assign({}, d.marks), brief: d.brief || null, use: Object.assign({}, d.use),
    index: d.index || null, argmap: null, plan: d.plan || null, history: null, defences: null, activity: null, terms: d.terms || null, createdAt: d.createdAt || 0, updatedAt: d.updatedAt || 0};
  // The writing record, vivas, drafts and the argument map go in as far as there's room, so a long essay never becomes too big to save:
  // vivas and drafts keep their verdicts and notes before their text, and the argument map, which can be rebuilt,
  // comes last.
  let used = bytes(JSON.stringify(body));
  if (d.activity) { body.activity = activityOut(d.activity, 245000 - used); used = bytes(JSON.stringify(body)); }
  if (d.defences && d.defences.length) { body.defences = defencesOut(d.defences, 235000 - used); used = bytes(JSON.stringify(body)); }
  if (d.history) { body.history = historyOut(d.history, 235000 - used); used = bytes(JSON.stringify(body)); }
  if (d.argmap && used + bytes(JSON.stringify(d.argmap)) < 240000) body.argmap = d.argmap;
  return body;
}
const num = (v, dflt) => Number.isFinite(v) ? v : dflt;
const str1500 = v => typeof v === 'string' && v ? v.slice(0, 1500) : null;
function cleanIssue(x) {
  const i = plainObj(x);
  if (!hasOwn(TYPES, i.type) || !safeId(i.id) || !str1500(i.qa)) return null;
  const d = plainObj(i.docB);
  return {id: i.id, type: i.type, severity: SEVS.includes(i.severity) ? i.severity : 'medium', confidence: num(i.confidence, null),
    title: clip(i.title, 90), qa: str1500(i.qa), qb: str1500(i.qb), docB: safeId(d.id) ? {id: d.id, title: clip(d.title, 200)} : null,
    explanation: clip(i.explanation, 700), fix: clip(i.fix, 500), suggestion: typeof i.suggestion === 'string' ? i.suggestion.slice(0, 2000) : null};
}
function cleanLink(x) {
  const l = plainObj(x), d = plainObj(l.docB);
  return str1500(l.qa) && str1500(l.qb) && safeId(d.id) ? {qa: str1500(l.qa), qb: str1500(l.qb), docB: {id: d.id, title: clip(d.title, 200)}} : null;
}
function cleanBriefItem(x) {
  const b = plainObj(x), req = clip(b.requirement, 160);
  return req ? {requirement: req, status: BRIEF_STATES.includes(b.status) ? b.status : 'partial', qa: str1500(b.qa), note: clip(b.note, 300)} : null;
}
function cleanReview(x) {
  const r = plainObj(x);
  if (!Array.isArray(r.issues)) return null;
  const s = plainObj(r.summary), arr = v => Array.isArray(v) ? v : [];
  return {at: num(r.at, 0), by: clip(r.by, 40) || 'Claude', tier: clip(r.tier, 40), textHash: typeof r.textHash === 'string' ? r.textHash.slice(0, 24) : null,
    checked: num(r.checked, 0), sources: num(r.sources, 0), summary: {thesis: clip(s.thesis, 400), start_with: clip(s.start_with, 400)},
    issues: r.issues.map(cleanIssue).filter(Boolean).slice(0, 60), links: arr(r.links).map(cleanLink).filter(Boolean).slice(0, 20),
    brief: arr(r.brief).map(cleanBriefItem).filter(Boolean).slice(0, 8),
    ctxSig: typeof r.ctxSig === 'string' ? r.ctxSig.slice(0, 24) : null, draft: safeId(r.draft) ? r.draft : null,
    recheck: r.recheck ? {changed: num(plainObj(r.recheck).changed, 0), of: num(plainObj(r.recheck).of, 0)} : null};
}
function cleanIndex(x) {
  const o = plainObj(x);
  if (typeof o.hash !== 'string' || !Array.isArray(o.claims)) return null;
  const m = plainObj(o.meta);
  const claims = o.claims.map(c => {
    const k = plainObj(c);
    return safeId(k.id) && typeof k.quote === 'string' && k.quote ? {id: k.id, claim: clip(k.claim, 300), quote: k.quote.slice(0, 600), para: Number.isInteger(k.para) ? k.para : 0, topic: clip(k.topic, 40)} : null;
  }).filter(Boolean).slice(0, 24);
  return {hash: o.hash.slice(0, 24), at: num(o.at, 0), meta: {authors: clip(m.authors, 160), year: clip(m.year, 12), summary: clip(m.summary, 400)}, claims};
}
function cleanArgmap(x) {
  const a = plainObj(x);
  if (typeof a.hash !== 'string' || !Array.isArray(a.paras)) return null;
  const ints = v => (Array.isArray(v) ? v : []).filter(k => Number.isInteger(k) && k > 0 && k < 100000).slice(0, 6), t = plainObj(a.thesis);
  const seen = new Set();
  const paras = a.paras.map(p => {
    const o = plainObj(p);
    if (!Number.isInteger(o.para) || o.para < 1 || o.para > 99999 || seen.has(o.para)) return null;
    seen.add(o.para);
    return {para: o.para, role: ARG_ROLES.includes(o.role) ? o.role : 'context', point: clip(o.point, 140),
      thread: Number.isFinite(o.thread) ? Math.max(0, Math.min(1, o.thread)) : 0.5, supports: ints(o.supports), answers: ints(o.answers)};
  }).filter(Boolean).slice(0, 400);
  const problems = (Array.isArray(a.problems) ? a.problems : []).map(p => {
    const o = plainObj(p);
    return ARG_PROBLEMS.includes(o.kind) ? {kind: o.kind, paras: ints(o.paras).slice(0, 4), note: clip(o.note, 220)} : null;
  }).filter(x => x && x.paras.length).slice(0, 8);
  return {at: num(a.at, 0), hash: a.hash.slice(0, 24), n: Number.isInteger(a.n) && a.n > 0 ? a.n : 0, thesis: {text: clip(t.text, 300), quote: str1500(t.quote)}, paras, problems};
}
// The brainstorm board: cards (the writer's own and Claude's) and an outline that points at them.
function cleanPlan(x) {
  const p = plainObj(x);
  if (!Array.isArray(p.cards)) return null;
  const cards = [], ids = new Set();
  for (const c0 of p.cards.slice(0, 200)) {
    const c = plainObj(c0), s = plainObj(c.src);
    if (!safeId(c.id) || ids.has(c.id) || !IDEA_KINDS.includes(c.kind)) continue;
    const src = c.kind === 'source' && safeId(s.id) && str1500(s.quote) ? {id: s.id, title: clip(s.title, 200), quote: clip(s.quote, 600)} : null;
    if (c.kind === 'source' && !src) continue;
    ids.add(c.id);
    cards.push({id: c.id, kind: c.kind, text: clip(c.text, 400), own: c.own === true, kept: c.kept === true, binned: c.binned === true, answer: clip(c.answer, 800), src});
  }
  const used = new Set(), outline = [];
  for (const o0 of (Array.isArray(p.outline) ? p.outline : []).slice(0, 80)) {
    const o = plainObj(o0);
    if (!ids.has(o.id) || used.has(o.id)) continue;
    used.add(o.id);
    const subs = [];
    for (const s of Array.isArray(o.subs) ? o.subs : []) if (ids.has(s) && !used.has(s) && subs.length < 12) { used.add(s); subs.push(s); }
    outline.push({id: o.id, label: clip(o.label, 120), subs});
  }
  return {q: clip(p.q, 600), at: num(p.at, 0), cards, outline};
}
// Drafts: newest last; each keeps its notes, and its text as paragraph fingerprints into a shared store.
const PH_RE = /^[0-9a-z]{1,16}$/;
function cleanHistory(x) {
  const H = plainObj(x), P = plainObj(H.paras), paras = Object.create(null), list = [];
  for (const s0 of (Array.isArray(H.list) ? H.list : []).slice(-30)) {
    const s = plainObj(s0);
    if (!safeId(s.id)) continue;
    const ps = Array.isArray(s.ps) && s.ps.length <= 3000 && s.ps.every(k => typeof k === 'string' && PH_RE.test(k) && hasOwn(P, k) && typeof P[k] === 'string') ? s.ps.slice() : null;
    if (ps) for (const k of ps) paras[k] = P[k].slice(0, 30000);
    const notes = (Array.isArray(s.notes) ? s.notes : []).slice(0, 60).map(n0 => {
      const n = plainObj(n0);
      return hasOwn(TYPES, n.t) && typeof n.k === 'string' ? {id: safeId(n.id) ? n.id : '', k: n.k.slice(0, 120), t: n.t, x: clip(n.x, 90), q: clip(n.q, 160), m: n.m === 'applied' || n.m === 'dismissed' ? n.m : null} : null;
    }).filter(Boolean);
    list.push({id: s.id, at: num(s.at, 0), kind: s.kind === 'recheck' ? 'recheck' : 'full', tier: clip(s.tier, 40), words: num(s.words, 0), ps, notes});
  }
  return list.length ? {paras, list} : null;
}
// Newest drafts first, until the room runs out: past that, older drafts keep their notes but not their text.
function historyOut(H, room) {
  const list = [], paras = {};
  let used = 200, textOk = true;
  for (let i = H.list.length - 1; i >= 0; i--) {
    const s = H.list[i], nb = bytes(JSON.stringify(s.notes)) + 160, add = [];
    let ps = textOk ? s.ps : null, ab = 0;
    if (ps) for (const k of ps) {
      if (hasOwn(paras, k) || add.includes(k)) continue;
      if (typeof H.paras[k] !== 'string') { ps = null; break; }
      add.push(k); ab += bytes(H.paras[k]) + 24;
    }
    if (ps && used + nb + ab + ps.length * 12 <= room) { for (const k of add) paras[k] = H.paras[k]; used += ab + ps.length * 12; }
    else { ps = null; textOk = false; }
    if (used + nb > room) break;
    used += nb;
    list.unshift(Object.assign({}, s, {ps}));
  }
  return list.length ? {paras, list} : null;
}
// Vivas ("Defend it"): questions with up to two turns each (the question and one follow-up).
function cleanDefences(x) {
  if (!Array.isArray(x)) return null;
  const out = [];
  for (const s0 of x.slice(-12)) {
    const s = plainObj(s0);
    if (!safeId(s.id) || !Array.isArray(s.qs)) continue;
    const qs = s.qs.slice(0, 8).map(q0 => {
      const q = plainObj(q0);
      const turns = (Array.isArray(q.turns) ? q.turns : []).slice(0, 2).map(t0 => {
        const t = plainObj(t0);
        return {q: clip(t.q, 300), a: clip(t.a, 1200), ms: num(t.ms, 0), pasted: num(t.pasted, 0), spoken: t.spoken === true,
          verdict: VERDICTS.includes(t.verdict) || t.verdict === 'skipped' ? t.verdict : null, feedback: clip(t.feedback, 400), fix: clip(t.fix, 240)};
      }).filter(t => t.q);
      return {q: clip(q.q, 300), why: clip(q.why, 140), quote: q.quote ? clip(q.quote, 600) || null : null, para: Number.isInteger(q.para) && q.para > 0 ? q.para : 0, turns};
    }).filter(q => q.q);
    if (qs.length) out.push({id: s.id, at: num(s.at, 0), style: hasOwn(VIVA_STYLE, s.style) ? s.style : 'tutor', done: s.done === true, qs});
  }
  return out.length ? out : null;
}
// Newest vivas first, until the room runs out: past that, older ones keep their questions and verdicts but not the answers.
function defencesOut(list, room) {
  const out = []; let used = 100;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i], full = bytes(JSON.stringify(s)) + 20;
    if (used + full <= room) { out.unshift(s); used += full; continue; }
    const lite = Object.assign({}, s, {qs: s.qs.map(q => Object.assign({}, q, {turns: q.turns.map(t => Object.assign({}, t, {a: '', feedback: ''}))}))}), lb = bytes(JSON.stringify(lite)) + 20;
    if (used + lb > room) break;
    out.unshift(lite); used += lb;
  }
  return out.length ? out : null;
}
function cleanBrief(x) {
  const b = plainObj(x);
  return typeof b.text === 'string' && b.text.trim() ? {text: b.text.slice(0, LIMITS.briefChars), at: num(b.at, 0)} : null;
}
function fromStored(id, x) {
  if (!x || (x.kind !== 'doc' && x.kind !== 'essay') || typeof x.text !== 'string' || !safeId(id)) return null;
  return {id, role: x.role === 'source' ? 'source' : 'essay', title: clip(x.title, 300), text: x.text.slice(0, LIMITS.docChars),
    review: cleanReview(x.review), marks: cleanFlags(x.marks, ['dismissed', 'applied']), brief: cleanBrief(x.brief),
    use: cleanFlags(x.use), index: cleanIndex(x.index), argmap: cleanArgmap(x.argmap), plan: cleanPlan(x.plan), history: cleanHistory(x.history), defences: cleanDefences(x.defences), activity: x.activity ? cleanActivity(x.activity) : null, terms: x.terms ? cleanTermCache(x.terms) : null, createdAt: +x.createdAt || 0, updatedAt: +x.updatedAt || 0};
}
function ensureReal(d) {
  if (!d.unsaved) return d;
  d.unsaved = false;
  if (d.isSample) {
    const old = d.id; d.isSample = false; d.id = newId();
    actOf(d).imported = {at: Date.now(), chars: d.text.length, words: words(d.text), name: '', sample: true};
    if (st.asks.has(old)) { st.asks.set(d.id, st.asks.get(old)); st.asks.delete(old); }
  }
  d.createdAt = d.createdAt || Date.now();
  st.docs.set(d.id, d);
  renderMeta();
  return d;
}
