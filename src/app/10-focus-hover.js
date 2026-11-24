// ---- focus and hover ----
function setHover(id) { if (st.hover === id) return; st.hover = id; applyStates(); }
function setActive(id, scroll) {
  if (id && st.view !== 'notes') setView('notes');
  st.active = id; renderRail(); applyStates();
  if (!id) return;
  if (scroll === 'text' && !narrow.matches) scrollToIssue(id);
  if (scroll === 'card') {
    if (narrow.matches) { scrollToIssue(id, 0.12); openSheet(); }
    requestAnimationFrame(() => { const c = rbody.querySelector('.card.on'); if (c) c.scrollIntoView({block: 'nearest', behavior: reduce ? 'auto' : 'smooth'}); });
  }
}
function scrollToIssue(id, frac) { const an = st.anchors.get(id); if (an && an.a) scrollToRange(an.a, frac, an.b); }
function scrollToRange(r, frac, r2) {
  const ra = rangeRects(r[0], r[1])[0]; if (!ra) return;
  const f = frac == null ? 0.35 : frac;
  let top = ra.top - innerHeight * f;
  if (r2) { const rb = rangeRects(r2[0], r2[1])[0]; if (rb && Math.abs(rb.top - ra.top) < innerHeight * 0.55) top = (Math.min(ra.top, rb.top) + Math.max(ra.bottom, rb.bottom)) / 2 - innerHeight * 0.45; }
  window.scrollTo({top: Math.max(0, scrollY + top), behavior: reduce ? 'auto' : 'smooth'});
}
function idsAt(x, y) {
  for (const el of document.elementsFromPoint(x, y)) if (el.classList && el.classList.contains('mk') && el.dataset.ids) return el.dataset.ids.split(' ');
  return [];
}
const byRank = ids => ids.slice().sort((a, b) => TYPES[typeOf(a)].rank - TYPES[typeOf(b)].rank);
function openSheet() { if (narrow.matches) rail.classList.add('open'); }
function closeSheet() { rail.classList.remove('open'); }

