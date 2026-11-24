// ---- margin lines ----
let lineRAF = 0;
function scheduleLines() { if (!lineRAF) lineRAF = requestAnimationFrame(() => { lineRAF = 0; drawLines(); }); }
function drawLines() {
  gut.replaceChildren();
  const box = gut.getBoundingClientRect(), W = box.width; if (!W) return;
  const items = [];
  for (const is of visibleIssues()) {
    const an = st.anchors.get(is.id);
    if (TYPES[is.type].src && is.docB) { const r = rangeRects(an.a[0], an.a[1])[0]; if (r) items.push({is, y1: r.top + r.height / 2 - box.top, lib: true}); continue; }
    if (!an.b) continue;
    const ra = rangeRects(an.a[0], an.a[1])[0], rb = rangeRects(an.b[0], an.b[1])[0]; if (!ra || !rb) continue;
    const ya = ra.top + ra.height / 2 - box.top, yb = rb.top + rb.height / 2 - box.top;
    items.push({is, y1: Math.min(ya, yb), y2: Math.max(ya, yb)});
  }
  const lanes = [], maxL = Math.max(1, Math.floor((W - 12) / 8));
  for (const r of items.filter(x => !x.lib).sort((a, b) => (a.y2 - a.y1) - (b.y2 - b.y1))) {
    let L = 0;
    while (lanes[L] && lanes[L].some(([a, b]) => r.y1 - 10 < b && r.y2 + 10 > a)) L++;
    (lanes[L] = lanes[L] || []).push([r.y1, r.y2]); r.lane = Math.min(L, maxL - 1);
  }
  const xe = W - 2;
  for (const it of items) {
    const g = sv('g', {class: 'rl' + (it.is.type === 'tension' ? ' ten' : '') + (it.lib ? ' lib' : ''), 'data-id': it.is.id});
    if (it.lib) {
      const x = Math.max(6, W - 16), y = it.y1;
      g.append(sv('path', {class: 'v', d: `M${x + 5} ${y}H${xe}`}), sv('rect', {class: 'bk', x: x - 5, y: y - 6, width: 10, height: 12, rx: 2}), sv('path', {class: 'v', d: `M${x - 2} ${y - 2}H${x + 2}M${x - 2} ${y + 1}H${x + 2}`}), sv('path', {class: 'hit', d: `M${x - 6} ${y}H${xe}`}));
    } else {
      const x = Math.max(3, W - 12 - it.lane * 8), d = `M${xe} ${it.y1}H${x}V${it.y2}H${xe}`;
      g.append(sv('path', {class: 'v', d}), sv('circle', {cx: xe, cy: it.y1, r: 3.5}), sv('circle', {cx: xe, cy: it.y2, r: 3.5}), sv('path', {class: 'hit', d}));
    }
    g.addEventListener('click', () => setActive(st.active === it.is.id ? null : it.is.id, 'card'));
    g.addEventListener('mouseenter', () => setHover(it.is.id));
    g.addEventListener('mouseleave', () => setHover(null));
    gut.append(g);
  }
  styleLines();
  drawChips();
}
function styleLines() {
  for (const g of gut.children) {
    const id = g.getAttribute('data-id');
    g.classList.toggle('on', id === st.active);
    g.classList.toggle('hov', id === st.hover);
    g.classList.toggle('dim', !!st.active && id !== st.active);
  }
}

