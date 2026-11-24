// ---- the marked-up text (drawn behind the real textarea) ----
function askRanges() {
  const list = st.asks.get(st.cur.id) || [], out = [], text = ed.value;
  list.forEach((a, i) => {
    if (i !== 0 && a.id !== st.askHover) return;
    const r = anchorExact(text, a.sel, a.s); if (r) { a.s = r[0]; a.e = r[1]; out.push(r); }
  });
  return out;
}
function renderBackdrop() {
  const text = ed.value, ranges = [];
  for (const is of visibleIssues()) {
    const an = st.anchors.get(is.id), rank = TYPES[is.type].rank;
    ranges.push({s: an.a[0], e: an.a[1], id: is.id, rank, type: is.type});
    if (an.b) ranges.push({s: an.b[0], e: an.b[1], id: is.id, rank, type: is.type});
  }
  for (const r of askRanges()) ranges.push({s: r[0], e: r[1], ask: true});
  for (const r of st.supHi || []) ranges.push({s: r[0], e: r[1], sup: true});
  const cuts = new Set([0, text.length]);
  for (const r of ranges) { cuts.add(r.s); cuts.add(r.e); }
  const pts = [...cuts].sort((a, b) => a - b), frag = document.createDocumentFragment();
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i], e = pts[i + 1]; if (e <= s) continue;
    const cov = ranges.filter(r => r.s <= s && r.e >= e), seg = text.slice(s, e);
    if (!cov.length) { frag.append(seg); continue; }
    const iss = cov.filter(r => r.id).sort((x, y) => x.rank - y.rank), span = document.createElement('span');
    const cls = [];
    if (iss.length) { cls.push('mk', 't-' + iss[0].type); span.dataset.ids = [...new Set(iss.map(r => r.id))].join(' '); }
    if (cov.some(r => r.ask)) cls.push('ask');
    if (cov.some(r => r.sup)) cls.push('sup');
    span.className = cls.join(' '); span.textContent = seg; frag.append(span);
  }
  frag.append('​');
  back.replaceChildren(frag);
  applyStates();
}
function typeOf(id) { const is = st.cur.review && st.cur.review.issues.find(i => i.id === id); return is ? is.type : null; }
function applyStates() {
  const act = st.active, hov = st.hover;
  back.classList.toggle('focus', !!act);
  if (act && typeOf(act)) back.style.setProperty('--hl', `color-mix(in srgb, var(${TYPES[typeOf(act)].c}) 20%, transparent)`);
  for (const el of back.querySelectorAll('.mk')) {
    const ids = el.dataset.ids.split(' ');
    el.classList.toggle('on', !!act && ids.includes(act));
    el.classList.toggle('hov', !!hov && hov !== act && ids.includes(hov));
  }
  for (const c of rbody.querySelectorAll('.card')) { c.classList.toggle('hov', c.dataset.id === hov && hov !== act); }
  styleLines();
}
function locate(off) {
  let acc = 0, last = null;
  for (const n of back.childNodes) {
    const t = n.nodeType === 3 ? n : n.firstChild; if (!t) continue;
    const len = t.nodeValue.length; last = t;
    if (off <= acc + len) return [t, Math.max(0, off - acc)];
    acc += len;
  }
  return last ? [last, last.nodeValue.length] : null;
}
function rangeRects(s, e) {
  const a = locate(s), b = locate(e); if (!a || !b) return [];
  const r = document.createRange();
  try { r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); } catch (err) { return []; }
  return [...r.getClientRects()].filter(x => x.width > 0.5 && x.height > 0);
}
function caretRect(p) {
  const a = locate(p); if (!a) return null;
  const r = document.createRange();
  try { r.setStart(a[0], a[1]); r.collapse(true); } catch (err) { return null; }
  return r.getClientRects()[0] || r.getBoundingClientRect();
}

