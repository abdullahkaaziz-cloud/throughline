// ---- documents: essays (your writing) and sources (papers you use) ----
// Everything read back from storage passes through fromStored(), which keeps only known fields,
// known values and bounded sizes, so a tampered or corrupted record can't break or script the page.
const newId = () => 'e' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
function makeDoc(title, text, role) {
  const now = Date.now();
  return {id: newId(), role: role === 'source' ? 'source' : 'essay', title: title || '', text: text || '', review: null,
    marks: Object.create(null), brief: null, use: Object.create(null), index: null, createdAt: now, updatedAt: now};
}
function makeSample() {
  return Object.assign(makeDoc('Should remote work become the default?', SAMPLE_TEXT),
    {id: 'sample', isSample: true, unsaved: true, review: cleanReview(JSON.parse(JSON.stringify(SAMPLE_REVIEW))), createdAt: 0, updatedAt: 0});
}
function sortedDocs() { return [...st.docs.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); }
function essayDocs() { return sortedDocs().filter(d => d.role !== 'source'); }
function sourceDocs() { return sortedDocs().filter(d => d.role === 'source'); }
function serial(d) {
  return {kind: 'doc', v: 2, role: d.role === 'source' ? 'source' : 'essay', title: d.title || '', text: d.text || '',
    review: d.review || null, marks: Object.assign({}, d.marks), brief: d.brief || null, use: Object.assign({}, d.use),
    index: d.index || null, createdAt: d.createdAt || 0, updatedAt: d.updatedAt || 0};
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
    brief: arr(r.brief).map(cleanBriefItem).filter(Boolean).slice(0, 8)};
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
function cleanBrief(x) {
  const b = plainObj(x);
  return typeof b.text === 'string' && b.text.trim() ? {text: b.text.slice(0, LIMITS.briefChars), at: num(b.at, 0)} : null;
}
function fromStored(id, x) {
  if (!x || (x.kind !== 'doc' && x.kind !== 'essay') || typeof x.text !== 'string' || !safeId(id)) return null;
  return {id, role: x.role === 'source' ? 'source' : 'essay', title: clip(x.title, 300), text: x.text.slice(0, LIMITS.docChars),
    review: cleanReview(x.review), marks: cleanFlags(x.marks, ['dismissed', 'applied']), brief: cleanBrief(x.brief),
    use: cleanFlags(x.use), index: cleanIndex(x.index), createdAt: +x.createdAt || 0, updatedAt: +x.updatedAt || 0};
}
function ensureReal(d) {
  if (!d.unsaved) return d;
  d.unsaved = false;
  if (d.isSample) {
    const old = d.id; d.isSample = false; d.id = newId();
    if (st.asks.has(old)) { st.asks.set(d.id, st.asks.get(old)); st.asks.delete(old); }
  }
  d.createdAt = d.createdAt || Date.now();
  st.docs.set(d.id, d);
  renderMeta();
  return d;
}
