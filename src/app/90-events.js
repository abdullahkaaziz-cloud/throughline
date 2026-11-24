// ---- events ----
ed.addEventListener('input', () => {
  st.touched = true;
  const d = ensureReal(st.cur);
  d.text = ed.value; d.updatedAt = Date.now();
  st.pstarts = paraStarts(d.text);
  reanchor(); renderBackdrop(); renderMeta(); hideSelbar();
  if (st.active && !isOpen({id: st.active})) st.active = null;
  const sig = openSig(); if (sig !== st.lastSig) { st.lastSig = sig; renderRail(); }
  setReviewBtn(); scheduleLines();
  ed.scrollTop = 0;
  if (document.activeElement === ed) keepCaret();
  persist(d);
});
function keepCaret() {
  const r = caretRect(ed.selectionEnd); if (!r) return;
  const vh = window.visualViewport ? visualViewport.height : innerHeight;
  if (r.bottom > vh - 28) window.scrollBy(0, r.bottom - vh + 100);
}
ed.addEventListener('scroll', () => { if (ed.scrollTop) ed.scrollTop = 0; });
let hovRAF = 0, hovXY = null;
ed.addEventListener('mousemove', e => {
  hovXY = [e.clientX, e.clientY];
  if (!hovRAF) hovRAF = requestAnimationFrame(() => { hovRAF = 0; const ids = idsAt(hovXY[0], hovXY[1]); setHover(ids.length ? byRank(ids)[0] : null); });
});
ed.addEventListener('mouseleave', () => setHover(null));
ed.addEventListener('click', e => {
  if (ed.selectionStart !== ed.selectionEnd) return;
  const ids = byRank(idsAt(e.clientX, e.clientY));
  if (!ids.length) { if (st.active) setActive(null); return; }
  const i = ids.indexOf(st.active);
  setActive(ids[(i + 1) % ids.length], 'card');
});
for (const ev of ['mouseup', 'keyup', 'touchend', 'select']) ed.addEventListener(ev, checkSel);
function fitTitle() { titleIn.style.height = 'auto'; titleIn.style.height = titleIn.scrollHeight + 'px'; }
titleIn.addEventListener('input', () => { if (/\n/.test(titleIn.value)) titleIn.value = titleIn.value.replace(/\s*\n+\s*/g, ' '); fitTitle(); st.touched = true; const d = ensureReal(st.cur); d.title = titleIn.value; d.updatedAt = Date.now(); renderDocBtn(); persist(d); });
titleIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (!ed.readOnly) ed.focus(); } });
selbar.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
for (const b of selbar.querySelectorAll('[data-ask]')) b.addEventListener('click', () => startAsk(b.dataset.ask));
$('#selform').addEventListener('submit', e => { e.preventDefault(); const q = selq.value.trim(); if (q) startAsk('custom', q); });
reviewBtn.addEventListener('click', runReview);
docBtn.addEventListener('click', () => openMenu(docMenu, docBtn, false));
aiBtn.addEventListener('click', () => openMenu(aiMenu, aiBtn, true));
$('#rhead').addEventListener('click', e => { if (narrow.matches && !e.target.closest('.chip')) rail.classList.toggle('open'); });
fileIn.addEventListener('change', () => { const fs = [...fileIn.files], role = st.importRole; fileIn.value = ''; st.importRole = 'essay'; if (fs.length) importFiles(fs, role); });
$('#readerClose').addEventListener('click', closeReader);
$('#readerOpen').addEventListener('click', () => { const d = readerDoc; closeReader(); if (d) openDoc(d); });
reader.addEventListener('click', e => { if (e.target === reader) closeReader(); });
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('.menu, #docBtn, #aiBtn')) closeMenus();
  if (!selbar.hidden && !e.target.closest('#selbar') && e.target !== ed) hideSelbar();
  if (!chipPop.hidden && !e.target.closest('#chipPop, .chip-src')) closePop();
});
addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!reader.hidden) closeReader();
    else if (!chipPop.hidden) closePop();
    else if (!srcWrap.hidden) closeSources();
    else if (!docMenu.hidden || !aiMenu.hidden) closeMenus();
    else if (!selbar.hidden) hideSelbar();
    else if (st.active) setActive(null);
    else closeSheet();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runReview(); }
});
const hasFiles = e => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
let dragN = 0;
addEventListener('dragenter', e => { if (hasFiles(e)) { dragN++; dropEl.hidden = false; } });
addEventListener('dragleave', e => { if (hasFiles(e) && --dragN <= 0) { dragN = 0; dropEl.hidden = true; } });
addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); dragN = 0; dropEl.hidden = true; importFiles([...e.dataTransfer.files], srcWrap.hidden ? 'essay' : 'source'); });
const edObserver = new ResizeObserver(() => { scheduleLines(); fitTitle(); if (!selbar.hidden) showSelbar(); });
edObserver.observe($('.edwrap'));
narrow.addEventListener('change', () => { closeSheet(); renderRail(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleLines);

