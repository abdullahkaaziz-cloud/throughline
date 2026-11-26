// ---- claims index: each document's main claims, read once by the AI and cached on the document ----
// Reads run one at a time (they spend the viewer's own plan), and a document is only read again when its text changes.
const indexRuns = new Map();
let indexChain = Promise.resolve();
function indexFresh(d) { return !!(d.index && d.index.hash === hash(d.text)); }
function indexState(d) {
  if (indexFresh(d)) return 'ready';
  return st.indexing.get(d.id) || (d.index ? 'stale' : 'none');
}
function indexPrompt(d) {
  return INDEX_RULES + '\n\nDOCUMENT TITLE: ' + docLabel(d) + '\n<document>\n' + fence(d.text.slice(0, 150000)) + '\n</document>';
}
function indexDoc(d) {
  if (indexFresh(d)) return Promise.resolve(true);
  if (indexRuns.has(d.id)) return indexRuns.get(d.id);
  st.indexing.set(d.id, 'queued'); renderSources();
  const run = async () => {
    if (indexFresh(d)) { st.indexing.delete(d.id); return true; }
    if (st.ai === 'pending') await capsReady;
    if (!sampleFn || st.ai !== 'ready') { st.indexing.set(d.id, 'error'); renderSources(); return false; }
    st.indexing.set(d.id, 'reading'); renderSources();
    const text = d.text;
    try {
      const ix = await askClaude('index', d, indexPrompt(d), {modelTier: 'default'}, raw => validateIndex(raw, text));
      st.indexing.delete(d.id);
      if (d.text !== text || !st.docs.has(d.id)) return false;
      d.index = {hash: hash(text), at: Date.now(), meta: ix.meta, claims: ix.claims};
      persist(d, 0);
      return true;
    } catch (e) {
      st.indexing.set(d.id, 'error'); noteAiError(e);
      return false;
    } finally { renderSources(); }
  };
  const p = indexChain.then(run, run).finally(() => indexRuns.delete(d.id));
  indexChain = p.catch(() => false);
  indexRuns.set(d.id, p);
  return p;
}
// Before a review: read the long documents whose claims aren't cached yet (short ones go in whole).
async function ensureIndexed(docs, onStep) {
  const need = docs.filter(d => d.text.length > LIMITS.fullTextChars && !indexFresh(d));
  for (let i = 0; i < need.length; i++) { onStep(i + 1, need.length); await indexDoc(need[i]); }
}
