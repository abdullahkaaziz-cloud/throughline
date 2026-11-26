// ---- essays out: a Word file, or a copy to paste, that keeps headings, footnotes and reference lists ----
// The Word file is built here (docxBytes in lib.js) and saved through the downloads capability. Copy puts the same
// parts on the clipboard as HTML, so Word and Google Docs keep the headings, with plain text beside it; where the
// page may not write HTML to the clipboard, plain text is copied instead.
const fileName = d => (clip(d.title, 120) || 'Untitled essay').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled essay';
const textOf = d => d === st.cur ? ed.value : d.text;
async function downloadWord(d) {
  d = d || st.cur; closeMenus();
  if (!d || !textOf(d).trim()) { toast('Write something first.'); return; }
  if (!st.dl) { toast('Downloads aren’t available in this view. Use Copy with formatting instead.'); return; }
  try {
    await st.dl.save({filename: fileName(d) + '.docx', data: docxBytes(d.title || '', textOf(d), d.heads, new Date().toISOString().replace(/\.\d+Z$/, 'Z'))});
    toast('Saved as a Word file, with its headings, footnotes and references.');
  } catch (e) {
    const c = e && e.code;
    if (c === 'declined') return;
    toast(c === 'host_unavailable' ? 'This app can’t save files. Open Throughline in a browser, or use Copy with formatting.' : c === 'unavailable' || c === 'not_granted' ? 'Downloads aren’t available in this view. Use Copy with formatting instead.' : 'The download didn’t work. Try again.');
  }
}
async function copyFormatted(d) {
  d = d || st.cur; closeMenus();
  if (!d || !textOf(d).trim()) { toast('Write something first.'); return; }
  const text = textOf(d), plain = (d.title ? d.title + '\n\n' : '') + text;
  try {
    if (!navigator.clipboard || typeof ClipboardItem !== 'function') throw new Error('no rich clipboard');
    await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([essayHtml(d.title || '', text, d.heads)], {type: 'text/html'}), 'text/plain': new Blob([plain], {type: 'text/plain'})})]);
    toast('Copied with its headings and footnotes. Paste it into Word or Google Docs.');
    return;
  } catch (e) {}
  try { await navigator.clipboard.writeText(plain); toast('Copied as plain text. For headings and footnotes, use Download as Word.'); return; } catch (e) {}
  // Last resort: a hidden copy of the text, selected and copied.
  const ta = h('textarea', {class: 'offscreen', 'aria-hidden': 'true', tabindex: '-1'}); ta.value = plain; document.body.append(ta);
  ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
  ta.remove();
  toast(ok ? 'Copied as plain text. For headings and footnotes, use Download as Word.' : 'Copying isn’t allowed here. Use Download as Word instead.');
}
