// ---- menus ----
function closeMenus() { docMenu.hidden = true; aiMenu.hidden = true; docBtn.setAttribute('aria-expanded', 'false'); aiBtn.setAttribute('aria-expanded', 'false'); }
function openMenu(menu, btn, right) {
  const was = !menu.hidden; closeMenus(); if (was) return;
  (menu === docMenu ? renderDocMenu : renderAiMenu)();
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
  items.push(h('hr'),
    st.cur && !st.cur.isSample && st.cur.role !== 'source' && st.cur.text.trim() ? h('button', {class: 'mi', id: 'menuRecord', onclick: openRecord}, h('span', {class: 'mt'}, h('b', null, 'Writing record'), h('span', {class: 'sub'}, 'How this essay was written: time, typed and pasted text, drafts, vivas and AI use'))) : null,
    h('button', {class: 'mi', onclick: newEssay}, h('span', {class: 'mt'}, h('b', null, 'New essay'))),
    h('button', {class: 'mi', onclick: () => { closeMenus(); pickFiles('essay'); }}, h('span', {class: 'mt'}, h('b', null, 'Upload essays'), h('span', {class: 'sub'}, 'Word, PDF or text, several at once. Each one joins your library.'))));
  if (!(st.cur && st.cur.isSample)) items.push(h('button', {class: 'mi', onclick: () => openDoc(makeSample())}, h('span', {class: 'mt'}, h('b', null, 'Open the sample essay'))));
  if (st.isOwner && !st.docs.has('seed-it')) items.push(h('button', {class: 'mi', onclick: addSeeds}, h('span', {class: 'mt'}, h('b', null, 'Add my 4 test essays'), h('span', {class: 'sub'}, 'With the 32 notes from test run 1. Only you see this option.'))));
  fill(docMenu, items);
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
  if (!st.docs.has(id)) return;
  st.docs.delete(id); clearTimeout(pending.get(id)); pending.delete(id); st.asks.delete(id);
  try { if (st.store === 'db') await col.doc(id).delete(); else if (st.store === 'local') writeLocal(); } catch (e) {}
  if (st.cur && st.cur.id === id) openDoc(sortedDocs()[0] || makeSample());
  if (!docMenu.hidden) renderDocMenu();
  renderSources();
  toast('Deleted');
}
async function addSeeds() {
  closeMenus();
  try {
    const res = await fetch('seed/test-essays.json'); if (!res.ok) throw new Error('seed');
    const arr = await res.json(), now = Date.now();
    arr.forEach((x, i) => {
      const d = Object.assign(makeDoc(str(x.title, 200), String(x.text || '').slice(0, LIMITS.docChars)), {id: safeId(String(x.id)) ? String(x.id) : newId(), review: cleanReview(x.review), createdAt: now, updatedAt: now - i * 1000});
      if (d.review) d.review.textHash = hash(d.text);
      st.docs.set(d.id, d); persist(d, 0);
    });
    if (arr.length) openDoc(st.docs.get(String(arr[0].id)));
    toast('Added your ' + plural(arr.length, 'test essay'));
  } catch (e) { toast('Couldn’t load the test essays.'); }
}

