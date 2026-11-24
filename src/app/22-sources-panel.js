// ---- sources panel: the brief, the sources and the other essays that count for this essay ----
const srcWrap = $('#srcWrap'), srcBtn = $('#srcBtn'), srcBody = $('#srcBody');
let briefTimer = 0, briefFor = null, srcReturnFocus = null;
function pickFiles(role) { st.importRole = role === 'source' ? 'source' : 'essay'; fileIn.click(); }
function renderSrcBtn() {
  if (!st.cur) return;
  const n = sourceDocs().filter(d => isUsed(st.cur, d)).length, brief = !!(st.cur.brief && st.cur.brief.text.trim()), count = $('#srcCount');
  count.textContent = n ? String(n) : ''; count.hidden = !n;
  srcBtn.setAttribute('aria-label', 'Sources: ' + (n ? plural(n, 'source') + ' on' : 'none on') + (brief ? ', brief added' : ''));
}
function openSources() {
  if (!srcWrap.hidden) return;
  srcReturnFocus = document.activeElement; closeMenus(); hideSelbar();
  srcWrap.hidden = false; srcBtn.setAttribute('aria-expanded', 'true');
  buildSources();
  $('#srcClose').focus({preventScroll: true});
}
function closeSources() {
  if (srcWrap.hidden) return;
  flushBrief();
  srcWrap.hidden = true; srcBtn.setAttribute('aria-expanded', 'false');
  if (srcReturnFocus && srcReturnFocus.isConnected) srcReturnFocus.focus({preventScroll: true});
}
function buildSources() {
  const e = st.cur;
  briefFor = e;
  $('#srcFor').textContent = 'For “' + trunc(e.title || 'Untitled essay', 48) + '”';
  fill(srcBody,
    h('section', {class: 'dsec'}, h('h3', null, 'Assignment brief'),
      h('p', {class: 'sub'}, 'Paste the question or marking criteria. Reviews check that the essay answers it.'),
      h('textarea', {id: 'briefIn', class: 'field', rows: '4', maxlength: String(LIMITS.briefChars), 'aria-label': 'Assignment brief',
        placeholder: 'For example: Evaluate whether remote work should be the default. 2,000 words.', oninput: onBriefInput}, e.brief ? e.brief.text : '')),
    h('section', {class: 'dsec'}, h('h3', null, 'Sources'),
      h('p', {class: 'sub'}, 'Papers and readings. Switch on the ones this essay uses, and reviews check your claims and citations against them.'),
      h('ul', {class: 'dlist', id: 'srcList'}),
      h('div', {class: 'acts'}, h('button', {class: 'btn sm primary', onclick: () => pickFiles('source')}, 'Add sources'),
        h('button', {class: 'btn sm', id: 'pasteBtn', 'aria-expanded': 'false', 'aria-controls': 'pasteForm', onclick: togglePaste}, 'Paste text')),
      h('form', {class: 'pform', id: 'pasteForm', hidden: true, onsubmit: onPaste},
        h('label', {class: 'flabel'}, 'Title', h('input', {class: 'field', id: 'pasteTitle', maxlength: '200', autocomplete: 'off', placeholder: 'Author (year), title'})),
        h('label', {class: 'flabel'}, 'Text', h('textarea', {class: 'field', id: 'pasteText', rows: '6', placeholder: 'Paste the paper, or the parts you use'})),
        h('div', {class: 'acts'}, h('button', {class: 'btn sm primary', type: 'submit'}, 'Add source'), h('button', {class: 'btn sm ghost', type: 'button', onclick: togglePaste}, 'Cancel')))),
    h('section', {class: 'dsec'}, h('h3', null, 'Your other essays'),
      h('p', {class: 'sub'}, 'Reviews look for clashes with the ones switched on.'),
      h('ul', {class: 'dlist', id: 'essList'})),
    h('p', {class: 'sub dfoot'}, 'Switches apply to this essay only. Everything stays in your private space.'));
  renderSources();
}
function renderSources() {
  if (!st.cur) return;
  renderSrcBtn();
  if (srcWrap.hidden || !$('#srcList')) return;
  const e = st.cur, srcs = sourceDocs(), ess = essayDocs().filter(d => d !== e && d.id !== e.id);
  fill($('#srcList'), srcs.length ? srcs.map(srcRow) : h('li', {class: 'dempty'}, 'No sources yet. Add the papers you’re using.'));
  fill($('#essList'), ess.length ? ess.map(srcRow) : h('li', {class: 'dempty'}, 'Your other essays will appear here.'));
}
function sourceMeta(d, state) {
  const ix = d.index, by = ix ? [ix.meta.authors, ix.meta.year].filter(Boolean).join(', ') : '';
  const said = {ready: plural(ix ? ix.claims.length : 0, 'claim') + ' found', reading: 'Reading…', queued: 'Waiting to be read', error: 'Couldn’t read it', stale: 'Changed since it was read', none: 'Not read yet'};
  return [by, hasOwn(said, state) ? said[state] : ''].filter(Boolean).join(' · ');
}
function srcRow(d) {
  const on = isUsed(st.cur, d), isSrc = d.role === 'source', state = isSrc ? indexState(d) : '';
  const acts = [h('button', {class: 'lnk', onclick: () => { if (isSrc) openReader(d, null); else { closeSources(); openDoc(d); } }}, 'Open')];
  if (isSrc && (state === 'error' || state === 'stale' || state === 'none')) acts.push(h('button', {class: 'lnk', onclick: () => indexDoc(d)}, state === 'error' ? 'Try again' : 'Read now'));
  if (isSrc) acts.push(delBtn(d));
  return h('li', {class: 'drow' + (on ? '' : ' off')},
    h('span', {class: 'dt'}, h('b', null, d.title || 'Untitled'),
      h('span', {class: 'sub', 'aria-live': isSrc ? 'polite' : null}, isSrc ? sourceMeta(d, state) : words(d.text).toLocaleString() + ' words' + (d.review ? ' · reviewed' : '')),
      h('span', {class: 'dacts'}, acts)),
    h('button', {class: 'switch', role: 'switch', 'aria-checked': String(on), 'aria-label': 'Use “' + (d.title || 'Untitled') + '” for this essay', onclick: () => {
      setUsed(st.cur, d, !on);
      if (!on && isSrc && state !== 'ready') indexDoc(d);
      renderSources(); renderRail();
    }}, h('span', {class: 'knob'})));
}
function delBtn(d) {
  const b = h('button', {class: 'lnk danger', onclick: () => {
    if (b.dataset.sure) { removeDoc(d.id); return; }
    b.dataset.sure = '1'; b.textContent = 'Delete for good?';
    setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = 'Delete'; } }, 3000);
  }}, 'Delete');
  return b;
}
function togglePaste() {
  const f = $('#pasteForm'), b = $('#pasteBtn');
  f.hidden = !f.hidden; b.setAttribute('aria-expanded', String(!f.hidden));
  if (!f.hidden) $('#pasteTitle').focus();
}
function onPaste(ev) {
  ev.preventDefault();
  const text = tidyText($('#pasteText').value).slice(0, LIMITS.docChars);
  if (words(text) < 20) { toast('Paste at least a paragraph.'); return; }
  const d = makeDoc(clip($('#pasteTitle').value, 200) || 'Pasted source', text, 'source');
  st.docs.set(d.id, d); persist(d, 0); setUsed(st.cur, d, true); indexDoc(d);
  $('#pasteTitle').value = ''; $('#pasteText').value = ''; togglePaste(); renderSources();
  toast('Added “' + trunc(d.title, 40) + '”. Reading it now.');
}
function onBriefInput() { clearTimeout(briefTimer); briefTimer = setTimeout(flushBrief, 600); }
function flushBrief() {
  clearTimeout(briefTimer); briefTimer = 0;
  const el = $('#briefIn'), e = briefFor;
  if (!el || !e) return;
  const v = el.value, cur = e.brief ? e.brief.text : '';
  if (v === cur || (!v.trim() && !cur)) return;
  setBrief(e, v); renderSrcBtn();
}
srcBtn.addEventListener('click', () => { if (srcWrap.hidden) openSources(); else closeSources(); });
$('#srcClose').addEventListener('click', closeSources);
srcWrap.addEventListener('pointerdown', e => { if (e.target === srcWrap) closeSources(); });
srcWrap.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const f = [...srcWrap.querySelectorAll('button, input, textarea')].filter(x => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
});
