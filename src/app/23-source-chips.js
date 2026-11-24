// ---- margin chips: passages your sources back up ----
const rmargin = $('#rmargin'), chipPop = $('#chipPop');
const BOOK_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.6c2-.8 3.8-.8 5.5.4 1.7-1.2 3.5-1.2 5.5-.4v9c-2-.8-3.8-.8-5.5.4-1.7-1.2-3.5-1.2-5.5-.4zM8 4v9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
function drawChips() {
  rmargin.replaceChildren();
  const rv = st.cur && st.cur.review;
  if (!rv || !rv.links || !rv.links.length) return;
  const box = rmargin.getBoundingClientRect();
  if (!box.height || !box.width) return;
  const rows = [];
  for (const l of rv.links) {
    const r = anchorExact(ed.value, l.qa), rect = r && rangeRects(r[0], r[1])[0];
    if (!rect) continue;
    const y = Math.round(rect.top - box.top + rect.height / 2);
    let row = rows.find(x => Math.abs(x.y - y) < 26);
    if (!row) { row = {y, items: []}; rows.push(row); }
    row.items.push({l, r});
  }
  for (const row of rows) {
    const n = row.items.length;
    rmargin.append(h('button', {class: 'chip-src', style: 'top:' + (row.y - 14) + 'px', 'aria-label': 'Backed by ' + plural(n, 'source passage') + '. Show them',
      onclick: e => openPop(e.currentTarget, row.items),
      onmouseenter: () => { st.supHi = row.items.map(x => x.r); renderBackdrop(); },
      onmouseleave: () => { if (chipPop.hidden) { st.supHi = null; renderBackdrop(); } }}, h('span', {html: BOOK_ICON}), String(n)));
  }
}
function openPop(anchor, items) {
  st.supHi = items.map(x => x.r); renderBackdrop();
  fill(chipPop, h('p', {class: 'lbl'}, 'Backed by your sources'), items.map(({l}) => {
    const doc = st.docs.get(l.docB.id);
    return h('div', {class: 'popi'}, h('b', null, l.docB.title), h('p', {class: 'q2'}, '“' + trunc(l.qb, 240) + '”'),
      doc ? h('button', {class: 'btn sm', onclick: () => { closePop(); openReader(doc, l.qb); }}, 'Open source') : null);
  }));
  chipPop.hidden = false;
  const r = anchor.getBoundingClientRect(), w = chipPop.offsetWidth, ph = chipPop.offsetHeight;
  chipPop.style.left = Math.max(8, Math.min(r.left - w - 8, innerWidth - w - 8)) + scrollX + 'px';
  chipPop.style.top = Math.max(8, Math.min(r.top - 8, innerHeight - ph - 8)) + scrollY + 'px';
  const b = chipPop.querySelector('button');
  if (b) b.focus({preventScroll: true});
}
function closePop() {
  if (chipPop.hidden) return;
  chipPop.hidden = true; st.supHi = null; renderBackdrop();
}
