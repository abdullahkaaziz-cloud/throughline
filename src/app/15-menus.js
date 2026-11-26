// ---- menus ----
function closeMenus() { for (const [m, b] of [[docMenu, docBtn], [aiMenu, aiBtn], [moreMenu, moreBtn]]) { m.hidden = true; b.setAttribute('aria-expanded', 'false'); } }
function openMenu(menu, btn, right) {
  const was = !menu.hidden; closeMenus(); if (was) return;
  (menu === docMenu ? renderDocMenu : menu === moreMenu ? renderMoreMenu : renderAiMenu)();
  menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
  const r = btn.getBoundingClientRect(), w = menu.offsetWidth;
  menu.style.left = Math.max(8, Math.min(right ? r.right - w : r.left, innerWidth - w - 8)) + 'px';
  menu.style.top = r.bottom + 6 + 'px';
  const f = menu.querySelector('button, input'); if (f) f.focus({preventScroll: true});
}
function renderDocMenu() {
  const docs = essayDocs(), items = [h('div', {class: 'msec'}, docs.length ? 'Your essays' : 'Your essays will appear here')];
  for (const d of docs) {
    const n = d.review ? d.review.issues.filter(is => !(d.marks || {})[is.id]).length : 0;
    const del = h('button', {class: 'del', 'aria-label': 'Delete ' + (d.title || 'Untitled essay'), onclick: e => {
      e.stopPropagation();
      if (del.classList.contains('sure')) { removeDoc(d.id); return; }
      del.classList.add('sure'); del.textContent = 'Delete?'; setTimeout(() => { del.classList.remove('sure'); del.textContent = 'Delete'; }, 3000);
    }}, 'Delete');
    items.push(h('div', {class: 'mi' + (d === st.cur ? ' cur' : ''), role: 'button', tabindex: '0', onclick: () => openDoc(d), onkeydown: e => { if (e.key === 'Enter') openDoc(d); }},
      h('span', {class: 'mt'}, h('b', null, d.title || 'Untitled essay'), h('span', {class: 'sub'}, [words(d.text).toLocaleString() + ' words', d.review ? plural(n, 'open note') : 'not reviewed', ago(d.updatedAt)].filter(Boolean).join(' · '))), del));
  }
  const c = st.cur, has = !!(c && !c.isSample && c.text.trim());
  items.push(h('hr'),
    menuItem('menuNew', 'New essay', null, newEssay),
    menuItem('menuUpload', 'Upload essays', 'Word, PDF or text, several at once. Each one joins your library.', () => { closeMenus(); pickFiles('essay'); }),
    c && c.isSample ? null : menuItem('menuSample', 'Open the sample essay', null, () => openDoc(makeSample())),
    has ? h('hr') : null,
    has && st.dl ? menuItem('menuWord', 'Download as Word', 'This essay as a .docx, with its headings, footnotes and references', () => downloadWord()) : null,
    has ? menuItem('menuCopy', 'Copy with formatting', 'To paste into Word or Google Docs', () => copyFormatted()) : null);
  fill(docMenu, items);
}
function menuItem(id, title, sub, fn) {
  return h('button', {class: 'mi', id, type: 'button', onclick: fn}, h('span', {class: 'mt'}, h('b', null, title), sub ? h('span', {class: 'sub'}, sub) : null));
}
// More: the tools people use now and then, help, feedback and settings, so the essay menu stays about essays.
function renderMoreMenu() {
  const c = st.cur, mine = !!c && c.role !== 'source', paras = c ? textParas(c.text).length : 0;
  const record = mine && !c.isSample && !!c.text.trim(), deep = mine && paras >= 3;
  const progress = essayDocs().some(d => !d.isSample && (d.review || (d.history && d.history.list.length)));
  fill(moreMenu,
    record || deep ? h('div', {class: 'msec'}, 'This essay') : null,
    deep ? menuItem('menuLoom', 'The loom', 'Your ideas as threads through the paragraphs', openLoom) : null,
    deep ? menuItem('menuBuild', 'Build-up', 'How your essay leads to its point', openBuild) : null,
    record ? menuItem('menuRecord', 'Writing record', 'How this essay was written: time, typed and pasted text, drafts, vivas and AI use', openRecord) : null,
    progress ? h('div', {class: 'msec'}, 'Across your essays') : null,
    progress ? menuItem('menuProgress', 'Your progress', 'How your writing is changing from essay to essay, and the habits behind your notes', openProgress) : null,
    record || deep || progress ? h('hr') : null,
    menuItem('menuHelp', 'Help', 'What each part of Throughline does, with short clips', openHelp),
    st.isOwner
      ? menuItem('menuInbox', 'Feedback from testers', st.inbox ? plural(st.inbox.reduce((s, f) => s + f.items.length, 0), 'message') : 'What people you share Throughline with have sent', openInbox)
      : menuItem('menuFeedback', 'Send feedback', 'What works, what doesn’t, and what would make it better', openFeedback),
    st.isOwner && dbApi ? menuItem('menuUsage', 'Usage', 'Who uses Throughline, what for, and what it would cost', openUsage) : null,
    menuItem('menuPrivacy', 'Privacy and your data', 'What’s kept and sent, usage counts, and downloading or deleting your data', openPrivacy));
}
function renderAiMenu() {
  const tiersOk = !st.tiers || st.tiers.includes('complex');
  const prov = (name, sub, state, mine) => h('div', {class: 'prov' + (mine ? '' : ' off')}, h('span', {class: 'pdot', data: {s: state}}), h('span', {class: 'mt'}, h('b', null, name), h('span', {class: 'sub'}, sub)), mine ? (state === 'ready' ? h('span', {class: 'okmark', 'aria-label': 'In use'}, '✓') : null) : h('span', {class: 'soon'}, 'Soon'));
  const seg = (v, name, sub) => h('button', {'aria-pressed': String(st.tier === v), onclick: () => { st.tier = v; savePrefs(); renderAiMenu(); }}, h('b', null, name), h('span', {class: 'sub'}, sub));
  fill(aiMenu,
    h('div', {class: 'msec'}, 'Who reviews your writing'),
    prov('Claude', st.ai === 'ready' ? 'Your own Claude plan · connected' : st.ai === 'pending' ? 'Connecting…' : st.aiWhy, st.ai, true),
    prov('ChatGPT', 'Sign in with ChatGPT · standalone app', 'later', false),
    prov('Gemini', 'Sign in with Google · standalone app', 'later', false),
    h('p', {class: 'mnote'}, 'This preview runs inside Claude, so it can only ask Claude. The standalone Throughline app signs in to each provider with your own account, and every provider gets the same review instructions.'),
    tiersOk ? h('div', {class: 'msec'}, 'Review depth') : null,
    tiersOk ? h('div', {class: 'seg', role: 'group', 'aria-label': 'Review depth'}, seg('complex', 'Thorough', 'Slower, catches more'), seg('default', 'Faster', 'A quicker first pass')) : null,
    h('button', {class: 'mi', onclick: () => { closeMenus(); openSources(); }}, h('span', {class: 'mt'}, h('b', null, 'Sources and past essays'), h('span', {class: 'sub'}, 'Choose what reviews of this essay check against'))));
}
function newEssay() {
  closeMenus();
  const d = makeDoc('', ''); d.unsaved = true;
  openDoc(d); st.readOnly = false; ed.readOnly = false; renderMeta(); titleIn.focus();
}
async function removeDoc(id) {
  const d = st.docs.get(id); if (!d) return;
  const was = st.cur && st.cur.id === id;
  st.docs.delete(id); clearTimeout(pending.get(id)); pending.delete(id); st.asks.delete(id); written.delete(id);
  try { if (st.store === 'db') await col.doc(id).delete(); else if (st.store === 'local') writeLocal(); } catch (e) {}
  if (was) openDoc(sortedDocs()[0] || makeSample());
  if (!docMenu.hidden) renderDocMenu();
  renderSources();
  // Undo puts it back, as it was.
  toast('Deleted “' + trunc(d.title || 'Untitled essay', 40) + '”.', () => {
    if (st.docs.has(id)) return;
    st.docs.set(id, d); written.delete(id); persist(d, 0);
    if (was) openDoc(d);
    if (!docMenu.hidden) renderDocMenu();
    renderSources(); toast('Restored.');
  });
}

