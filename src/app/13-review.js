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
// The related documents, each in its own fenced block, and a lookup from the model's references back to them.
function docsBlock(ctx) {
  return ctx.map(c => '<document id="' + c.ref + '" role="' + (c.doc.role === 'source' ? 'source' : 'essay') + '" title="' + docLabel(c.doc) +
    '" content="' + (c.mode === 'full' ? 'full text' : 'main claims only') + '">\n' + fence(c.mode === 'full' ? c.doc.text : claimsText(c.doc)) + '\n</document>').join('\n\n');
}
function ctxResolver(ctx) {
  const byRef = new Map(ctx.map(c => [c.ref, c.doc]));
  return ref => {
    const r = clip(ref, 200);
    if (!r) return null;
    const d = byRef.get(r.toUpperCase()) || (ctx.find(c => (c.doc.title || '').toLowerCase() === r.toLowerCase()) || {}).doc;
    return d ? {id: d.id, title: d.title || 'Untitled', text: d.text, role: d.role, claims: d.index ? d.index.claims : []} : null;
  };
}
function reviewPrompt(essay, text, ctx) {
  const numbered = text.split('\n').map(x => x.trim()).filter(Boolean).map((x, i) => '[' + (i + 1) + '] ' + x).join('\n\n');
  const brief = essay.brief && essay.brief.text.trim()
    ? '\n\nBRIEF (the assignment question or marking criteria):\n<brief>\n' + fence(essay.brief.text) + '\n</brief>' : '';
  const docs = docsBlock(ctx);
  return REVIEW_RULES + '\n\nESSAY TITLE: ' + docLabel(essay) + brief +
    '\n\nESSAY (each paragraph starts with its number in brackets; never include these numbers in a quote):\n' + fence(numbered) + '\n\n' +
    (ctx.length ? 'OTHER DOCUMENTS (role "essay": the writer’s earlier essays; role "source": material the writer uses):\n' + docs : 'OTHER DOCUMENTS: none.');
}
// A re-check sends the changed paragraphs in full, starred, with the ones around them and the ones the last review
// tied to them; the rest of the essay goes in as first sentences.
function recheckPrompt(essay, text, ctx, plan) {
  const changed = new Set(plan.changed), full = new Set(plan.full);
  const numbered = textParas(text).map((x, i) => { const n = i + 1; return changed.has(n) ? '[' + n + '*] ' + x : full.has(n) ? '[' + n + '] ' + x : '[' + n + '] (in short) ' + gist(x); }).join('\n\n');
  const brief = essay.brief && essay.brief.text.trim()
    ? '\n\nBRIEF (the assignment question or marking criteria):\n<brief>\n' + fence(essay.brief.text) + '\n</brief>' : '';
  return REVIEW_RULES + '\n\n' + RECHECK_RULES + '\n\nESSAY TITLE: ' + docLabel(essay) + brief +
    '\n\nESSAY (each paragraph starts with its number in brackets, and a star marks the ones that changed; never include these numbers in a quote):\n' + fence(numbered) + '\n\n' +
    (ctx.length ? 'OTHER DOCUMENTS (role "essay": the writer’s earlier essays; role "source": material the writer uses):\n' + docsBlock(ctx) : 'OTHER DOCUMENTS: none.');
}
// Whether the next review can be a re-check, and of which paragraphs.
function recheckFor(d, text) {
  const rv = d.review, s = lastDraft(d);
  if (!rv || !s || !s.ps || rv.draft !== s.id || rv.textHash === hash(text) || rv.ctxSig !== ctxSig(d)) return null;
  const prevText = s.ps.map(k => d.history.paras[k] || '').join('\n\n'), starts = paraStarts(prevText), links = [];
  for (const is of rv.issues) {
    if (TYPES[is.type].src || !is.qb) continue;
    const a = anchorFuzzy(prevText, is.qa), b = anchorFuzzy(prevText, is.qb);
    if (a && b) links.push([paraIndex(starts, a[0]), paraIndex(starts, b[0])]);
  }
  return recheckPlan(s.ps, textParas(text).map(paraHash), links);
}
// New notes must involve a changed paragraph; earlier notes stay (with your marks) while every passage they quote
// is still there, in a paragraph that didn't change. The summary and brief carry over.
function mergeRecheck(d, raw, text, ctx, tier, plan) {
  const fresh = buildReview(raw, text, ctx, tier), prev = d.review, starts = paraStarts(text), changed = new Set(plan.changed);
  const at = q => { const r = q ? anchorFuzzy(text, q) : null; return r ? paraIndex(starts, r[0]) : 0; };
  const twoSided = is => !TYPES[is.type].src && !!is.qb;
  const touches = is => changed.has(at(is.qa)) || (twoSided(is) && changed.has(at(is.qb)));
  const intact = q => { const p = at(q); return p > 0 && !changed.has(p); };
  const kept = prev.issues.filter(is => intact(is.qa) && (!twoSided(is) || intact(is.qb)));
  const keys = new Set(kept.map(is => noteKey(is.type, is.qa)));
  const issues = kept.concat(fresh.issues.filter(is => touches(is) && !keys.has(noteKey(is.type, is.qa)))).slice(0, 60);
  const marks = Object.create(null);
  for (const is of kept) if (d.marks && d.marks[is.id]) marks[is.id] = d.marks[is.id];
  d.marks = marks;
  return Object.assign({}, prev, {at: fresh.at, tier: fresh.tier, textHash: fresh.textHash, checked: fresh.checked, sources: fresh.sources, issues,
    links: prev.links.filter(l => intact(l.qa)).concat(fresh.links.filter(l => changed.has(at(l.qa)))).slice(0, 20),
    recheck: {changed: plan.changed.length, of: textParas(text).length}});
}
function buildReview(raw, text, ctx, tier) {
  const resolveDoc = ctxResolver(ctx);
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
async function runReview(how) {
  if (st.reviewing) { toast('A review is already running.'); return; }
  if (st.mode !== 'write') setMode('write');
  const d = st.cur, text = ed.value;
  if (words(text) < 40) { toast('Write or paste at least a paragraph first.'); return; }
  if (st.ai === 'pending') await capsReady;
  if (!sampleFn || st.ai !== 'ready') { toast(st.aiWhy || 'AI review isn’t available in this view.'); return; }
  const tier = pickTier(), plan = how && how.full === true ? null : recheckFor(d, text);
  const R = st.reviewing = {doc: d, ctl: new AbortController(), t0: Date.now(), found: 0, writing: false, lib: 0, src: 0, tier: tier || 'default', stage: '', recheck: plan ? plan.changed.length : 0};
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
    const make = () => plan ? recheckPrompt(d, text, ctx, plan) : reviewPrompt(d, text, ctx);
    let prompt = make();
    while (bytes(prompt) > LIMITS.promptBytes && ctx.length) { ctx.pop(); prompt = make(); }
    if (bytes(prompt) > LIMITS.promptBytes) throw {code: 'prompt_too_large'};
    R.src = ctx.filter(c => c.doc.role === 'source').length; R.lib = ctx.length - R.src; updateProgress();
    const opts = {signal: R.ctl.signal, onText: ({text: t}) => { if (st.reviewing !== R) return; R.writing = true; R.found = (t.match(/"type"\s*:/g) || []).length; updateProgress(); }};
    if (tier) opts.modelTier = tier;
    const raw = await sampleFn.json(prompt, opts);
    markLastDraft(d);
    if (plan) d.review = mergeRecheck(d, raw, text, ctx, tier || 'default', plan);
    else {
      const before = lastDraft(d), gone = new Set(before && d.review && d.review.draft === before.id ? before.notes.filter(x => x.m === 'dismissed').map(x => x.k) : []);
      d.review = buildReview(raw, text, ctx, tier || 'default'); d.marks = Object.create(null);
      // Notes you dismissed stay dismissed when a full review finds them again.
      for (const is of d.review.issues) if (gone.has(noteKey(is.type, is.qa))) d.marks[is.id] = 'dismissed';
    }
    d.review.ctxSig = ctxSig(d);
    snapshot(d, text, plan ? 'recheck' : 'full');
    st.tlSel = -1; d.updatedAt = Date.now();
    persist(d, 0);
    const n = d.review.issues.length;
    toast(plan ? 'Re-checked ' + plural(plan.changed.length, 'changed paragraph') + ' · ' + plural(n, 'note') : n ? plural(n, 'note') + ' on “' + trunc(d.title || 'your essay', 40) + '”' : 'No problems found.');
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
