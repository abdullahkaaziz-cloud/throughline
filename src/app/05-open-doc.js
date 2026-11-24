// ---- open / switch ----
function openDoc(d) {
  if (!srcWrap.hidden) flushBrief();
  st.cur = d; st.active = null; st.hover = null; st.filter = 'all'; st.anchors = new Map(); st.reviewError = null;
  st.argHover = []; st.argSel = []; st.argHere = 0;
  hideSelbar(); closeMenus();
  loadEditor();
  if (!srcWrap.hidden) buildSources();
  window.scrollTo(0, 0);
}
function loadEditor() {
  const d = st.cur;
  titleIn.value = d.title || ''; fitTitle();
  if (ed.value !== d.text) ed.value = d.text;
  st.readOnly = coarse && !!d.text.trim(); ed.readOnly = st.readOnly;
  refresh();
}
function refresh() {
  st.pstarts = paraStarts(ed.value);
  reanchor(); renderBackdrop(); renderMeta(); renderDocBtn(); renderSrcBtn(); setReviewBtn();
  st.lastSig = openSig(); renderRail(); scheduleLines();
}

