// ---- ask about a selection ----
function checkSel() {
  requestAnimationFrame(() => {
    if (document.activeElement !== ed) return;
    const s = ed.selectionStart, e = ed.selectionEnd;
    if (e - s < 2 || !ed.value.slice(s, e).trim()) { hideSelbar(); return; }
    st.sel = [s, e]; showSelbar();
  });
}
function showSelbar() {
  if (st.ai === 'denied' || st.ai === 'off' || !st.sel) return;
  const rects = rangeRects(st.sel[0], st.sel[1]); if (!rects.length) { hideSelbar(); return; }
  selbar.hidden = false;
  const first = rects[0], last = rects[rects.length - 1], bw = selbar.offsetWidth, bh = selbar.offsetHeight;
  let top = first.top - bh - 10;
  if (coarse || top < 72) top = last.bottom + 12;
  const pr = paper.getBoundingClientRect();
  const left = Math.max(8, Math.min(first.left, innerWidth - bw - 8, Math.max(pr.left + 8, pr.right - bw - 8)));
  selbar.style.left = left + scrollX + 'px'; selbar.style.top = top + scrollY + 'px';
}
function hideSelbar() { selbar.hidden = true; selq.value = ''; }
function askPrompt(d, text, s, e, question) {
  const p = paraIndex(paraStarts(text), s);
  let paras = text.split('\n').map(x => x.trim()).filter(Boolean).map((x, i) => '[' + (i + 1) + '] ' + x).join('\n\n');
  if (paras.length > 150000) paras = paras.slice(0, 150000) + '\n[…]';
  return `You are a careful essay editor helping a student with one passage of their essay. You never rewrite the essay for them: you explain what you see and suggest what to change.

ESSAY TITLE: ${d.title || 'Untitled'}
ESSAY (paragraphs numbered in brackets):
${paras}

THE STUDENT SELECTED THIS PASSAGE (in paragraph [${p}]):
"""${text.slice(s, e).slice(0, 4000)}"""

THEIR QUESTION: ${question}

Reply with only this JSON:
{"points":[{"label":"2 to 5 words","detail":"one or two sentences"}],"suggestion":null}
- points: 1 to 4 observations, most useful first, specific to this passage. Refer to other paragraphs as ¶ and a number (for example ¶3) when they matter.
- suggestion: only if a small change to the selected passage would clearly help, the full replacement text for exactly the selected passage, keeping the student's voice and changing as little as possible; otherwise null.
- Plain English, no markdown.`;
}
function startAsk(kind, custom) {
  if (!st.sel) return;
  const [s, e] = st.sel, d = st.cur;
  hideSelbar();
  if (!sampleFn) { toast(st.aiWhy || 'AI isn’t available in this view.'); return; }
  const a = {id: 'a' + Date.now(), label: kind === 'custom' ? trunc(custom, 80) : ASKS[kind].label, question: kind === 'custom' ? custom : ASKS[kind].q, s, e, sel: ed.value.slice(s, e), state: 'loading'};
  if (!st.asks.has(d.id)) st.asks.set(d.id, []);
  const list = st.asks.get(d.id); list.unshift(a); if (list.length > 5) list.length = 5;
  runAsk(a, d);
}
async function runAsk(a, d) {
  a.state = 'loading'; a.ctl = new AbortController();
  renderBackdrop(); renderRail(); openSheet(); rbody.scrollTop = 0;
  try {
    const res = await sampleFn.json(askPrompt(d, ed.value, a.s, a.e, a.question), {signal: a.ctl.signal, modelTier: 'default'});
    const pts = (res && Array.isArray(res.points) ? res.points : []).slice(0, 5).map(p => ({label: str(p && p.label, 80), detail: str(p && p.detail, 700)})).filter(p => p.label || p.detail);
    a.points = pts.length ? pts : [{label: 'No clear answer', detail: 'Try asking in a different way.'}];
    const sg = res && typeof res.suggestion === 'string' ? res.suggestion.trim() : '';
    a.suggestion = sg && sg !== a.sel.trim() ? sg : null;
    a.state = 'done';
  } catch (err) {
    a.state = err && err.code === 'cancelled' ? 'stopped' : 'error'; a.err = err; noteAiError(err);
  }
  if (st.cur === d) { renderRail(); }
}
function retryAsk(a) { const r = anchorExact(ed.value, a.sel, a.s); if (r) { a.s = r[0]; a.e = r[1]; } runAsk(a, st.cur); }
function applyAsk(a) {
  const r = anchorExact(ed.value, a.sel, a.s);
  if (!r) { toast('That passage has changed since you asked.'); return; }
  a.applied = true; replaceRange(r[0], r[1], a.suggestion); renderRail();
}
function closeAsk(a) {
  if (a.state === 'loading' && a.ctl) a.ctl.abort();
  const list = st.asks.get(st.cur.id) || [], i = list.indexOf(a); if (i >= 0) list.splice(i, 1);
  st.askHover = null; renderBackdrop(); renderRail();
}

