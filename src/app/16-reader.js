// ---- library reader ----
let readerDoc = null, readerBack = null;
function openReader(d, quote) {
  if (reader.hidden) readerBack = document.activeElement;
  readerDoc = d; $('#readerTitle').textContent = d.title || 'Untitled essay';
  const body = $('#readerBody'), r = anchorFuzzy(d.text, quote); body.replaceChildren();
  let i = 0;
  for (const line of d.text.split('\n')) {
    const s0 = i, e0 = i + line.length; i = e0 + 1;
    if (!line.trim()) continue;
    const p = h('p');
    if (r && r[0] < e0 && r[1] > s0) { const a = Math.max(r[0], s0) - s0, b = Math.min(r[1], e0) - s0; p.append(line.slice(0, a), h('mark', null, line.slice(a, b)), line.slice(b)); }
    else p.textContent = line;
    body.append(p);
  }
  reader.hidden = false;
  const m = body.querySelector('mark'); if (m) m.scrollIntoView({block: 'center'});
  $('#readerClose').focus({preventScroll: true});
}
function closeReader() {
  if (reader.hidden) return;
  reader.hidden = true; readerDoc = null;
  if (readerBack && readerBack.isConnected && readerBack.focus) readerBack.focus({preventScroll: true});
  readerBack = null;
}
trapTab(reader);

