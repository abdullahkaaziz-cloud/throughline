// ---- whole-essay review ----
function libraryFor(d) {
  const out = []; let used = 0;
  for (const x of sortedDocs()) {
    if (x === d || x.id === d.id || x.text.trim().length < 200 || out.length >= 6) continue;
    const t = x.text.length > 30000 ? x.text.slice(0, 30000) + '\n[…]' : x.text;
    if (used + t.length > 100000) break;
    out.push({id: x.id, title: x.title || 'Untitled', text: t}); used += t.length;
  }
  return out;
}
function reviewPrompt(d, text, lib) {
  const essay = text.split('\n').map(x => x.trim()).filter(Boolean).map((x, i) => '[' + (i + 1) + '] ' + x).join('\n\n');
  const others = lib.map((x, i) => `<document id="D${i + 1}" title="${x.title.replace(/["<>]/g, '')}">\n${x.text}\n</document>`).join('\n\n');
  return REVIEW_RULES + '\n\nESSAY TITLE: ' + (d.title || 'Untitled') + '\n\nESSAY (each paragraph starts with its number in brackets; never include these numbers in a quote):\n' + essay +
    '\n\n' + (lib.length ? 'OTHER DOCUMENTS (the writer’s earlier essays):\n' + others : 'OTHER DOCUMENTS: none.');
}
function pickLib(lib, ref) {
  const r = String(ref == null ? '' : ref).trim(); if (!r) return lib.length === 1 ? lib[0] : null;
  const m = /^D(\d+)$/i.exec(r); if (m) return lib[+m[1] - 1] || null;
  const low = r.toLowerCase();
  return lib.find(x => x.title.toLowerCase() === low) || lib.find(x => x.title.toLowerCase().includes(low) || low.includes(x.title.toLowerCase())) || null;
}
function buildReview(raw, text, lib, tier) {
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.issues) ? raw.issues : [];
  const N = normMap(text), out = [], seen = new Set(), rid = Date.now().toString(36);
  list.forEach((it, k) => {
    if (!it || typeof it !== 'object') return;
    let type = str(it.type, 40).toLowerCase().replace(/[\s-]+/g, '_');
    if (type === 'library' || type === 'clash' || type === 'library_conflict') type = 'library_clash';
    const T = TYPES[type]; if (!T) return;
    const pa = it.passage_a || {}, pb = it.passage_b || {};
    const a = anchorFuzzy(text, pa.quote != null ? pa.quote : it.quote, null, N); if (!a) return;
    const sev = str(it.severity, 10).toLowerCase(), conf = Number(it.confidence);
    const rec = {id: 'n' + k + '-' + rid, type, severity: SEVR[sev] != null ? sev : 'medium', confidence: isFinite(conf) ? conf : null,
      title: str(it.title, 90), qa: text.slice(a[0], a[1]), qb: null, docB: null, explanation: str(it.explanation, 700), fix: str(it.fix, 500),
      suggestion: typeof it.suggestion === 'string' && it.suggestion.trim() ? it.suggestion.slice(0, 2000) : null};
    if (T.rel) {
      const b = anchorFuzzy(text, pb.quote, null, N);
      if (!b || (b[0] < a[1] && a[0] < b[1])) return;
      rec.qb = text.slice(b[0], b[1]);
    } else if (type === 'library_clash') {
      const x = pickLib(lib, pb.document), full = x && st.docs.get(x.id); if (!full) return;
      const b = anchorFuzzy(full.text, pb.quote); if (!b) return;
      rec.qb = full.text.slice(b[0], b[1]); rec.docB = {id: full.id, title: full.title || 'Untitled'};
    }
    if (rec.confidence != null && rec.confidence < 0.3) return;
    const key = type + ':' + a[0] + ':' + a[1]; if (seen.has(key)) return; seen.add(key);
    if (rec.suggestion === rec.qa) rec.suggestion = null;
    out.push(rec);
  });
  const sum = raw && raw.summary || {};
  return {at: Date.now(), by: 'Claude', tier, textHash: hash(text), checked: lib.length, summary: {thesis: str(sum.thesis, 400), start_with: str(sum.start_with, 400)}, issues: out};
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
    prompt_too_large: 'Too much text for one review. Turn off “Check against my other essays”, or shorten the essay.',
    upstream_error: 'The connection dropped. Try again.',
  };
  return M[c] || 'Something went wrong. Try again.';
}
function noteAiError(e) { if (isHard(e)) { st.ai = 'denied'; st.aiWhy = errText(e); renderAiBtn(); setReviewBtn(); hideSelbar(); } }
async function runReview() {
  if (st.reviewing) { toast('A review is already running.'); return; }
  const d = st.cur, text = ed.value;
  if (words(text) < 40) { toast('Write or paste at least a paragraph first.'); return; }
  if (st.ai === 'pending') await capsReady;
  if (!sampleFn || st.ai !== 'ready') { toast(st.aiWhy || 'AI review isn’t available in this view.'); return; }
  const lib = st.useLib ? libraryFor(d) : [];
  let prompt = reviewPrompt(d, text, lib);
  while (bytes(prompt) > 250000 && lib.length) { lib.pop(); prompt = reviewPrompt(d, text, lib); }
  if (bytes(prompt) > 250000) { toast('This essay is too long to review in one go.'); return; }
  const tier = pickTier();
  st.reviewing = {doc: d, ctl: new AbortController(), t0: Date.now(), found: 0, writing: false, lib: lib.length, tier: tier || 'default'};
  st.reviewError = null; st.active = null;
  setReviewBtn(); renderRail(); openSheet(); rbody.scrollTop = 0;
  const tick = setInterval(updateProgress, 1000);
  try {
    const opts = {signal: st.reviewing.ctl.signal, onText: ({text: t}) => { const R = st.reviewing; if (!R) return; R.writing = true; R.found = (t.match(/"type"\s*:/g) || []).length; updateProgress(); }};
    if (tier) opts.modelTier = tier;
    const raw = await sampleFn.json(prompt, opts);
    const rv = buildReview(raw, text, lib, tier || 'default');
    d.review = rv; d.marks = {}; d.updatedAt = Date.now();
    persist(d, 0);
    const n = rv.issues.length;
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

