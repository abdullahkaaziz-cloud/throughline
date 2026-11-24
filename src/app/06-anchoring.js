// ---- anchoring: keep each note pinned to its passage while the text changes ----
function reanchor() {
  const d = st.cur, text = ed.value, prev = st.anchors, next = new Map();
  if (d.review) for (const is of d.review.issues) {
    const p = prev.get(is.id), T = TYPES[is.type];
    const a = anchorExact(text, is.qa, p && p.a ? p.a[0] : null);
    const b = T.rel && is.qb ? anchorExact(text, is.qb, p && p.b ? p.b[0] : null) : null;
    next.set(is.id, {a, b, ok: !!a && (!T.rel || !!b)});
  }
  st.anchors = next;
}
const para = off => paraIndex(st.pstarts, off);
const isOpen = is => !(st.cur.marks || {})[is.id] && !!(st.anchors.get(is.id) || {}).ok;
function openIssues() {
  const rv = st.cur.review; if (!rv) return [];
  const pos = is => st.anchors.get(is.id).a[0];
  return rv.issues.filter(isOpen).sort((x, y) => (SEVR[x.severity] ?? 1) - (SEVR[y.severity] ?? 1) || TYPES[x.type].rank - TYPES[y.type].rank || pos(x) - pos(y));
}
const visibleIssues = () => openIssues().filter(is => st.filter === 'all' || TYPES[is.type].g === st.filter);
function changedSinceReview() { const rv = st.cur.review; return !!(rv && rv.textHash && rv.textHash !== hash(ed.value)); }
function openSig() {
  return openIssues().map(is => { const an = st.anchors.get(is.id); return is.id + ':' + para(an.a[0]) + (an.b ? '-' + para(an.b[0]) : ''); }).join('|') + '#' + Object.keys(st.cur.marks || {}).length + (changedSinceReview() ? '*' : '');
}

