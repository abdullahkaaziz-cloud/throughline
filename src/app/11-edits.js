// ---- edits from notes and answers ----
function replaceRange(s, e, text, quiet) {
  const ro = ed.readOnly; ed.readOnly = false;
  ed.focus({preventScroll: true}); ed.setSelectionRange(s, e);
  let ok = false; try { ok = document.execCommand('insertText', false, text); } catch (err) {}
  if (!ok) { ed.setRangeText(text, s, e, 'end'); ed.dispatchEvent(new Event('input', {bubbles: true})); }
  ed.readOnly = ro; if (ro) ed.blur();
  if (!quiet) toast('Applied. ' + (mac ? '⌘Z' : 'Ctrl+Z') + ' undoes it.');
}
function applyIssue(is) {
  const an = st.anchors.get(is.id); if (!an || !an.a) return;
  const d = st.cur; d.marks = d.marks || {}; d.marks[is.id] = 'applied';
  st.active = null;
  appEdit('ai', is.suggestion, () => replaceRange(an.a[0], an.a[1], is.suggestion));
  persist(ensureReal(d));
}
function markIssue(id, how) {
  const d = ensureReal(st.cur); d.marks = d.marks || {};
  if (how) d.marks[id] = how; else delete d.marks[id];
  if (st.active === id) st.active = null;
  d.updatedAt = Date.now(); persist(d);
  st.lastSig = openSig(); renderBackdrop(); renderRail(); scheduleLines();
}

