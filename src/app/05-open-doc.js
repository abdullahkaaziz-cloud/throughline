// ---- open / switch ----
function openDoc(d) {
  if (!srcWrap.hidden) flushBrief();
  st.cur = d; st.active = null; st.hover = null; st.filter = 'all'; st.anchors = new Map(); st.reviewError = null;
  st.argHover = []; st.argSel = []; st.argHere = 0; st.termCur = null; st.termHi = null; st.termErr = null; st.loomSel = null; st.loomHi = null;
  hideSelbar(); closeMenus();
  loadEditor();
  st.tlSel = -1; st.lastLen = ed.value.length; st.lastInputAt = 0; st.pasteText = null;
  if (st.mode === 'plan') renderBoard();
  else if (st.mode === 'compare') setMode('write');
  else if (st.mode === 'map') renderMap();
  else if (st.mode === 'defend') { hush(); stopDictation(); st.vivaView = null; renderDefend(); }
  else if (st.mode === 'record') renderRecord();
  else if (st.mode === 'loom') renderLoom();
  else if (st.mode === 'progress' || st.mode === 'inbox') setMode('write');
  if (!srcWrap.hidden) buildSources();
  updateTermCount();
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

