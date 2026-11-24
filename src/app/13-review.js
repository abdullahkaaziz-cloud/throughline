// ---- whole-essay review: the essay, its brief, and the sources and essays switched on for it ----
const docLabel = d => clip(d.title || 'Untitled', 160).replace(/["<>\n]/g, ' ');
function claimsText(d) {
  const ix = d.index;
  if (!ix) return '';
  const head = [ix.meta.authors && 'Authors: ' + ix.meta.authors, ix.meta.year && 'Year: ' + ix.meta.year, ix.meta.summary && 'Summary: ' + ix.meta.summary].filter(Boolean);
  return head.concat(ix.claims.map(c => c.id + ': ' + c.claim + '\n    "' + c.quote + '"')).join('\n');
}
// Which related documents go in, and in what form: everything gets its claims, small ones go in full.
function buildContext(essay, ownBytes) {
  const docs = contextDocs(essay).slice(0, LIMITS.contextDocs);
  const items = docs.map(d => ({id: d.id, fullBytes: bytes(d.text), claimsBytes: indexFresh(d) ? bytes(claimsText(d)) : null}));
  const budget = Math.max(0, Math.min(LIMITS.contextBytes, LIMITS.promptBytes - ownBytes - 16000));
  const {plan} = planContext(items, budget, LIMITS.fullTextBytes);
  return docs.filter(d => plan.has(d.id)).map((d, i) => ({doc: d, ref: 'D' + (i + 1), mode: plan.get(d.id)}));
}
function reviewPrompt(essay, text, ctx) {
  const numbered = text.split('\n').map(x => x.trim()).filter(Boolean).map((x, i) => '[' + (i + 1) + '] ' + x).join('\n\n');
  const brief = essay.brief && essay.brief.text.trim()
    ? '\n\nBRIEF (the assignment question or marking criteria):\n<brief>\n' + fence(essay.brief.text) + '\n</brief>' : '';
  const docs = ctx.map(c => '<document id="' + c.ref + '" role="' + (c.doc.role === 'source' ? 'source' : 'essay') + '" title="' + docLabel(c.doc) +
    '" content="' + (c.mode === 'full' ? 'full text' : 'main claims only') + '">\n' + fence(c.mode === 'full' ? c.doc.text : claimsText(c.doc)) + '\n</document>').join('\n\n');
  return REVIEW_RULES + '\n\nESSAY TITLE: ' + docLabel(essay) + brief +
    '\n\nESSAY (each paragraph starts with its number in brackets; never include these numbers in a quote):\n' + fence(numbered) + '\n\n' +
    (ctx.length ? 'OTHER DOCUMENTS (role "essay": the writer’s earlier essays; role "source": material the writer uses):\n' + docs : 'OTHER DOCUMENTS: none.');
}
function buildReview(raw, text, ctx, tier) {
  const byRef = new Map(ctx.map(c => [c.ref, c.doc]));
  const resolveDoc = ref => {
    const r = clip(ref, 200);
    if (!r) return null;
    const d = byRef.get(r.toUpperCase()) || (ctx.find(c => (c.doc.title || '').toLowerCase() === r.toLowerCase()) || {}).doc;
    return d ? {id: d.id, title: d.title || 'Untitled', text: d.text, role: d.role, claims: d.index ? d.index.claims : []} : null;
  };
  const out = parseReview(raw, {text, types: TYPES, resolveDoc, rid: Date.now().toString(36)});
  const srcN = ctx.filter(c => c.doc.role === 'source').length;
  return Object.assign({at: Date.now(), by: 'Claude', tier, textHash: hash(text), checked: ctx.length - srcN, sources: srcN}, out);
}
function pickTier() { const want = st.tier; if (st.tiers && !st.tiers.includes(want)) return st.tiers.includes('default') ? 'default' : undefined; return want; }
const HARD = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
const isHard = e => HARD.includes(e && e.code);
function errText(e) {
  const c = e && e.code;
  const M = {
    not_granted: 'Claude wasn’t allowed for this page. Reload the page to be asked again.',
    sampling_disabled: 'Claude isn’t available for this account here.',
    not_declared: 'This page can’t call Claude right now.',
    capability_disabled: 'This page can’t call Claude in this view.',
    capability_removed: 'Update the Claude app to use AI review here.',
    rate_limited: e && e.reason === 'usage_limit' ? 'You’ve reached your Claude usage limit. Try again when it resets.' : 'Too many requests at once. Wait a moment, then try again.',
    session_expired: 'Your Claude session expired. Sign in again, then retry.',
    refused: 'Claude declined to review this text.',
    empty_completion: 'Claude returned nothing. Try again, or review a shorter piece.',
    invalid_json: 'The answer came back in the wrong shape. Try again.',
    prompt_too_large: 'Too much text for one review. Switch off some sources, or shorten the essay.',
    upstream_error: 'The connection dropped. Try again.',
  };
  return hasOwn(M, c) ? M[c] : 'Something went wrong. Try again.';
}
function noteAiError(e) { if (isHard(e)) { st.ai = 'denied'; st.aiWhy = errText(e); renderAiBtn(); setReviewBtn(); hideSelbar(); } }
async function runReview() {
  if (st.reviewing) { toast('A review is already running.'); return; }
  const d = st.cur, text = ed.value;
  if (words(text) < 40) { toast('Write or paste at least a paragraph first.'); return; }
  if (st.ai === 'pending') await capsReady;
  if (!sampleFn || st.ai !== 'ready') { toast(st.aiWhy || 'AI review isn’t available in this view.'); return; }
  const tier = pickTier();
  const R = st.reviewing = {doc: d, ctl: new AbortController(), t0: Date.now(), found: 0, writing: false, lib: 0, src: 0, tier: tier || 'default', stage: ''};
  st.reviewError = null; st.active = null;
  if (st.view !== 'notes') setView('notes');
  setReviewBtn(); renderRail(); openSheet(); rbody.scrollTop = 0;
  const tick = setInterval(updateProgress, 1000);
  try {
    // Long documents are read once for their claims (cached), so the review can carry many of them.
    await ensureIndexed(contextDocs(d).slice(0, LIMITS.contextDocs), (i, n) => { R.stage = 'Reading your sources · ' + i + ' of ' + n; updateProgress(); });
    if (R.ctl.signal.aborted) throw {code: 'cancelled'};
    R.stage = '';
    const ctx = buildContext(d, bytes(text) + bytes(d.brief ? d.brief.text : ''));
    let prompt = reviewPrompt(d, text, ctx);
    while (bytes(prompt) > LIMITS.promptBytes && ctx.length) { ctx.pop(); prompt = reviewPrompt(d, text, ctx); }
    if (bytes(prompt) > LIMITS.promptBytes) throw {code: 'prompt_too_large'};
    R.src = ctx.filter(c => c.doc.role === 'source').length; R.lib = ctx.length - R.src; updateProgress();
    const opts = {signal: R.ctl.signal, onText: ({text: t}) => { if (st.reviewing !== R) return; R.writing = true; R.found = (t.match(/"type"\s*:/g) || []).length; updateProgress(); }};
    if (tier) opts.modelTier = tier;
    const raw = await sampleFn.json(prompt, opts);
    d.review = buildReview(raw, text, ctx, tier || 'default'); d.marks = Object.create(null); d.updatedAt = Date.now();
    persist(d, 0);
    const n = d.review.issues.length;
    toast(n ? plural(n, 'note') + ' on “' + trunc(d.title || 'your essay', 40) + '”' : 'No problems found.');
  } catch (err) {
    if (!(err && err.code === 'cancelled')) { st.reviewError = {doc: d, err}; noteAiError(err); }
  } finally {
    clearInterval(tick); st.reviewing = null;
    if (st.cur === d) { st.filter = 'all'; refresh(); } else setReviewBtn();
  }
}
function setReviewBtn() {
  const busy = !!st.reviewing, icon = $('#reviewIcon'), label = $('#reviewLabel');
  icon.className = busy ? 'spin' : '';
  label.textContent = busy ? 'Reviewing' : st.cur && st.cur.review && changedSinceReview() ? 'Review again' : 'Review';
  reviewBtn.disabled = busy || st.ai === 'denied' || st.ai === 'off';
  reviewBtn.title = st.ai === 'ready' || st.ai === 'pending' ? 'Review the whole essay (' + (mac ? '⌘' : 'Ctrl') + '+Enter)' : st.aiWhy;
}
