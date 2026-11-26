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
// Word files come in through mammoth's HTML, read here as data (never put into the page): the Title style becomes
// the essay's title, headings are remembered (heads) so a Word download keeps them, footnotes and endnotes become
// [1] in the text with a Notes section at the end, list items keep a bullet or number, and a table's rows become
// lines with their cells joined by " | ".
async function docxToText(buf) {
  await loadScript(LIBS.mammoth);
  const r = await window.mammoth.convertToHtml({arrayBuffer: buf}, {styleMap: ["p[style-name='Title'] => p.doc-title:fresh", "p[style-name='Subtitle'] => p.doc-subtitle:fresh"]});
  return htmlToEssay(r.value);
}
function htmlToEssay(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html'), paras = [], heads = [], notes = new Map(), order = new Map();
  let title = '';
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  // Number the notes in the order the text first uses them.
  for (const a of doc.querySelectorAll('a[href^="#footnote-"], a[href^="#endnote-"]')) {
    const id = a.getAttribute('href').slice(1);
    if (!order.has(id)) order.set(id, order.size + 1);
    a.textContent = '[' + order.get(id) + ']';
  }
  const walk = el => {
    for (const n of el.children) {
      const tag = n.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) { const t = clean(n.textContent); if (t) { paras.push(t); heads.push({t, l: tag === 'h1' ? 1 : 2}); } }
      else if (tag === 'p') {
        const t = clean(n.textContent);
        if (!t) continue;
        if (n.classList.contains('doc-title') && !title && !paras.length) title = t;
        else paras.push(t);
      } else if (tag === 'ol' || tag === 'ul') {
        let k = 0;
        for (const li of n.children) {
          const id = li.id || '';
          if (/^(footnote|endnote)-/.test(id)) {
            for (const a of li.querySelectorAll('a[href^="#footnote-ref"], a[href^="#endnote-ref"]')) a.remove();
            const t = clean(li.textContent); if (t && order.has(id)) notes.set(order.get(id), t);
            continue;
          }
          k++;
          const t = clean(li.textContent); if (t) paras.push((tag === 'ol' ? k + '. ' : '• ') + t);
        }
      } else if (tag === 'table') {
        for (const tr of n.querySelectorAll('tr')) { const t = [...tr.children].map(c => clean(c.textContent)).filter(Boolean).join(' | '); if (t) paras.push(t); }
      } else walk(n);
    }
  };
  walk(doc.body);
  if (notes.size) { paras.push('Notes'); heads.push({t: 'Notes', l: 1}); for (const [k, t] of [...notes].sort((a, b) => a[0] - b[0])) paras.push('[' + k + '] ' + t); }
  return {text: paras.join('\n\n'), heads, title};
}
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
      let text, heads = null, wordTitle = '';
      if (ext === 'pdf') text = await pdfToText(await f.arrayBuffer());
      else if (ext === 'docx') { const w = await docxToText(await f.arrayBuffer()); text = w.text; heads = w.heads; wordTitle = w.title; }
      else if (['txt', 'md', 'markdown', 'text'].includes(ext) || (f.type || '').startsWith('text/')) text = tidyText(await f.text());
      else { toast('Can’t read ' + f.name + '. Use Word, PDF or text files.'); continue; }
      if (!text.trim()) { toast(f.name + ' has no text to read. Is it a scan?'); continue; }
      if (text.length > LIMITS.docChars) { text = text.slice(0, LIMITS.docChars); toast('Kept the first part of ' + f.name + '; the rest is too long.'); }
      let title = wordTitle || titleFrom(f.name);
      const firstPara = text.split('\n\n')[0];
      if (!wordTitle && firstPara && firstPara.length < 120 && !/[.!:;]$/.test(firstPara) && firstPara.split(' ').length >= 2 && !/^(introduction|abstract|contents|preface|summary|chapter|section|part)\b/i.test(firstPara)) { title = firstPara; text = text.slice(firstPara.length).replace(/^\n+/, ''); }
      const d = makeDoc(title, text, role);
      if (heads && heads.length) d.heads = cleanHeads(heads.filter(x => x.t !== title));
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

