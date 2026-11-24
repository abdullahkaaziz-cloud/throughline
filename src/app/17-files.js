// ---- files ----
// Third-party code loads only from pinned versions, checked against their published hashes (subresource integrity).
const scriptLoads = new Map();
function loadScript(lib) {
  if (!scriptLoads.has(lib.src)) scriptLoads.set(lib.src, new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = lib.src; s.integrity = lib.sri; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer';
    s.onload = () => res();
    s.onerror = () => { s.remove(); scriptLoads.delete(lib.src); rej(new Error('Could not load ' + lib.src)); };
    document.head.append(s);
  }));
  return scriptLoads.get(lib.src);
}
async function pdfToText(buf) {
  await loadScript(LIBS.pdf); await loadScript(LIBS.pdfw);
  const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = LIBS.pdfw.src;
  const pdf = await lib.getDocument({data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true}).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent(), lines = [];
    for (const it of tc.items) {
      if (typeof it.str !== 'string' || !it.transform) continue;
      const x = it.transform[4], y = it.transform[5], hgt = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
      let ln = lines.find(l => Math.abs(l.y - y) < Math.max(1.5, hgt * 0.3));
      if (!ln) { ln = {y, h: 0, items: []}; lines.push(ln); }
      if (it.str) { ln.items.push({x, w: it.width || 0, s: it.str, h: hgt}); ln.h = Math.max(ln.h, hgt); }
    }
    for (const ln of lines) {
      ln.items.sort((a, b) => a.x - b.x);
      let s = '', end = null;
      for (const it of ln.items) {
        if (end != null && it.x - end > it.h * 0.18 && !/\s$/.test(s) && !/^\s/.test(it.s)) s += ' ';
        s += it.s; end = it.x + it.w;
      }
      ln.s = s.replace(/\s+/g, ' ').trim(); ln.x = ln.items.length ? ln.items[0].x : 0; ln.xe = end || 0;
    }
    pages.push(lines.filter(l => l.s).sort((a, b) => b.y - a.y));
  }
  const all = pages.flat(); if (!all.length) return '';
  const hs = all.map(l => l.h).sort((a, b) => a - b), bodyH = hs[Math.floor(hs.length / 2)];
  const gaps = [];
  for (const pg of pages) for (let i = 1; i < pg.length; i++) { const g = pg[i - 1].y - pg[i].y; if (g > 0 && pg[i].h >= bodyH * 0.85) gaps.push(g); }
  gaps.sort((a, b) => a - b); const gap = gaps[Math.floor(gaps.length / 2)] || bodyH * 1.3;
  const xs = all.filter(l => l.h >= bodyH * 0.85).map(l => l.x).sort((a, b) => a - b), left = xs[Math.floor(xs.length * 0.1)] || 0;
  const xes = all.filter(l => l.h >= bodyH * 0.85).map(l => l.xe).sort((a, b) => a - b), right = xes[Math.floor(xes.length * 0.9)] || 0;
  const bodyLines = [], noteLines = [];
  for (const pg of pages) {
    let prev = null;
    for (const l of pg) {
      if (/^\d{1,3}$/.test(l.s)) continue;
      if (l.h < bodyH * 0.85) { if (/^\d{1,3}$/.test(l.s)) continue; if (/^\d{1,3}\s/.test(l.s)) noteLines.push(''); noteLines.push(l.s); continue; }
      const ind = l.x > left + bodyH * 0.9;
      const cont = prev && (CONNECT.test(prev.s) || (prev.xe > right - bodyH * 2 && !/[.!?:;"\u201D\u2019)\]]$/.test(prev.s)));
      if (prev && !cont && (prev.y - l.y > gap * 1.45 || (ind && !(prev.x > left + bodyH * 0.9)))) bodyLines.push('');
      bodyLines.push(l.s); prev = l;
    }
  }
  const body = reflow(bodyLines), notes = reflow(noteLines).filter(n => n.length > 3);
  return body.join('\n\n') + (notes.length ? '\n\nNotes\n\n' + notes.join('\n\n') : '');
}
async function docxToText(buf) { await loadScript(LIBS.mammoth); const r = await window.mammoth.extractRawText({arrayBuffer: buf}); return tidyText(r.value); }
function titleFrom(name) {
  return name.replace(/\.[^.]+$/, '').replace(/^[0-9a-f]{8}-/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled essay';
}
// role: 'essay' (opens in the editor) or 'source' (joins the library and is read for its claims).
async function importFiles(files, role) {
  role = role === 'source' ? 'source' : 'essay';
  const added = [];
  for (const f of files) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (f.size > LIMITS.fileBytes) { toast(f.name + ' is over 25 MB, too large to open.'); continue; }
    try {
      let text;
      if (ext === 'pdf') text = await pdfToText(await f.arrayBuffer());
      else if (ext === 'docx') text = await docxToText(await f.arrayBuffer());
      else if (['txt', 'md', 'markdown', 'text'].includes(ext) || (f.type || '').startsWith('text/')) text = tidyText(await f.text());
      else { toast('Can’t read ' + f.name + '. Use Word, PDF or text files.'); continue; }
      if (!text.trim()) { toast(f.name + ' has no text to read. Is it a scan?'); continue; }
      if (text.length > LIMITS.docChars) { text = text.slice(0, LIMITS.docChars); toast('Kept the first part of ' + f.name + '; the rest is too long.'); }
      let title = titleFrom(f.name);
      const firstPara = text.split('\n\n')[0];
      if (firstPara && firstPara.length < 120 && !/[.!:;]$/.test(firstPara) && firstPara.split(' ').length >= 2 && !/^(introduction|abstract|contents|preface|summary|chapter|section|part)\b/i.test(firstPara)) { title = firstPara; text = text.slice(firstPara.length).replace(/^\n+/, ''); }
      const d = makeDoc(title, text, role);
      if (role !== 'source') actOf(d).imported = {at: Date.now(), chars: text.length, words: words(text), name: clip(f.name, 160)};
      st.docs.set(d.id, d); persist(d, 0); added.push(d);
    } catch (e) { toast('Couldn’t open ' + f.name + '.'); }
  }
  if (!added.length) return;
  if (role === 'source') {
    for (const d of added) { setUsed(st.cur, d, true); indexDoc(d); }
    renderSources();
    toast(added.length > 1 ? 'Added ' + added.length + ' sources. Reading them now.' : 'Added “' + trunc(added[0].title, 40) + '”. Reading it now.');
  } else {
    openDoc(added[0]);
    toast(added.length > 1 ? 'Added ' + added.length + ' essays to your library' : 'Opened “' + trunc(added[0].title, 40) + '”');
  }
}

