// ---- documents ----
const newId = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function makeDoc(title, text) { const now = Date.now(); return {id: newId(), title: title || '', text: text || '', review: null, marks: {}, createdAt: now, updatedAt: now}; }
function makeSample() { return {id: 'sample', isSample: true, unsaved: true, title: 'Should remote work become the default?', text: SAMPLE_TEXT, review: JSON.parse(JSON.stringify(SAMPLE_REVIEW)), marks: {}, createdAt: 0, updatedAt: 0}; }
function sortedDocs() { return [...st.docs.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); }
function serial(d) { return {kind: 'essay', v: 1, title: d.title || '', text: d.text || '', review: d.review || null, marks: d.marks || {}, createdAt: d.createdAt || 0, updatedAt: d.updatedAt || 0}; }
function cleanReview(r) {
  if (!r || typeof r !== 'object' || !Array.isArray(r.issues)) return null;
  r.issues = r.issues.filter(i => i && TYPES[i.type] && typeof i.qa === 'string' && i.qa && typeof i.id === 'string');
  return r;
}
function fromStored(id, x) {
  if (!x || x.kind !== 'essay' || typeof x.text !== 'string') return null;
  return {id, title: typeof x.title === 'string' ? x.title : '', text: x.text, review: cleanReview(x.review), marks: x.marks && typeof x.marks === 'object' ? x.marks : {}, createdAt: +x.createdAt || 0, updatedAt: +x.updatedAt || 0};
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

