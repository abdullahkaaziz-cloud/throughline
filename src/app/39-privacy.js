// ---- privacy and your data: what Throughline keeps and sends, usage counts on or off, and all your data to take
// away (one JSON file) or delete ----
function openPrivacy() {
  closeMenus();
  const counting = st.store === 'db' && !!dbApi && !!myId, P = trackPrefs();
  const stat = h('p', {class: 'smeta', id: 'trackStat', 'aria-live': 'polite'});
  const box = h('input', {type: 'checkbox', id: 'trackOn', checked: counting && P.track && !st.usageOff, disabled: !counting || !!st.usageOff,
    onchange: async () => { box.disabled = true; await setTracking(box.checked, Date.now()); box.disabled = false;
      stat.textContent = box.checked ? 'Usage counts are on.' : 'Usage counts are off, and what was counted has been deleted.'; }});
  const where = st.store === 'db' ? 'Saved in your own space in Throughline. Nobody else can open them, including whoever shared Throughline with you. If a save fails, a copy waits in this browser until it goes through.'
    : st.store === 'local' ? 'Saved in this browser only. Nobody else can see them. Use the same browser to come back to them.' : 'Not saved in this view: they’re gone when you close it.';
  openDlg('Privacy and your data',
    h('ul', {class: 'wlist'},
      h('li', null, h('b', null, 'Your essays and sources. '), where),
      h('li', null, h('b', null, 'Claude. '), 'When you press something that uses AI, such as Review or a question about a passage, Throughline sends Claude the text it needs: the essay, and the brief and sources you’ve switched on for it. It runs on your own Claude plan. Nothing is sent otherwise.'),
      st.isOwner ? null : h('li', null, h('b', null, 'Feedback. '), 'What you send with Send feedback is read by whoever shared Throughline with you, with your name.'),
      h('li', null, h('b', null, 'Usage counts. '), 'Which features you use, how much text goes to Claude and comes back (as a number of characters), how long it takes, when something fails, and your ratings of notes. Never your writing. ' +
        (st.isOwner ? 'Your own use is counted too, marked as yours.' : 'Only whoever shared Throughline sees them, with your name.'))),
    counting ? h('label', {class: 'flab tog'}, box, h('span', null, 'Count what I use')) : h('p', {class: 'smeta'}, 'Nothing is counted in this view.'),
    st.usageOff ? h('p', {class: 'smeta'}, 'Counting isn’t allowed in this view.') : null, stat,
    h('h3', {class: 'dsub'}, 'Your data'),
    h('p', {class: 'smeta'}, 'Download one file with every essay and source, with their notes, drafts and plans, your map, habits and terms' + (counting ? ', your feedback and your usage counts' : '') + '.'),
    h('div', {class: 'wacts'},
      st.dl ? h('button', {class: 'btn', type: 'button', id: 'exportAll', onclick: exportAll}, 'Download all my data') : h('p', {class: 'smeta'}, 'Downloads aren’t available in this view.'),
      h('button', {class: 'btn danger', type: 'button', id: 'deleteAll', onclick: confirmDeleteAll}, 'Delete all my data')),
    h('div', {id: 'delWrap'}));
}
async function exportData() {
  const get = async p => { try { const s = await dbApi.doc(p).get(); return s && s.exists ? structuredClone(s.data()) : null; } catch (e) { return null; } };
  const ok = st.store === 'db' && dbApi && myId;
  if (ok) await flushUsage();
  const fb = ok ? await get('feedback/' + myId) : null;
  const records = {};
  for (const k of Object.keys(SPECIAL)) { const r = SPECIAL[k].out(); if (r) records[k] = r; }
  return {kind: 'throughline-export', v: 1, at: new Date().toISOString(), name: myName || '',
    documents: sortedDocs().map(d => Object.assign({id: d.id}, serial(d))), records,
    feedback: fb ? cleanFeedback(fb) : null, usage: fb && fb.usage ? cleanUsage(fb.usage, Object.keys(TYPES)) : null};
}
async function exportAll() {
  if (!st.dl) { toast('Downloads aren’t available in this view.'); return; }
  const btn = $('#exportAll'); if (btn) btn.disabled = true;
  try {
    const data = await exportData();
    await st.dl.save({filename: 'Throughline data ' + utcDay() + '.json', data: JSON.stringify(data, null, 1)});
    toast('Your data was downloaded.');
  } catch (e) {
    const c = e && e.code;
    if (c !== 'declined') toast(c === 'host_unavailable' ? 'This app can’t save files. Open Throughline in a browser to download your data.' : 'The download didn’t work. Try again.');
  } finally { if (btn && btn.isConnected) btn.disabled = false; }
}
function confirmDeleteAll() {
  const wrap = $('#delWrap'); if (!wrap) return;
  const counting = st.store === 'db' && !!dbApi && !!myId, nE = essayDocs().length, nS = sourceDocs().length;
  fill(wrap, h('div', {class: 'delbox', role: 'alert'},
    h('p', null, h('b', null, 'Delete everything? '), 'This deletes ' + plural(nE, 'essay') + ' and ' + plural(nS, 'source') + ', with their notes and drafts, your map, habits and terms' +
      (counting ? ', your feedback and your usage counts' : '') + '. It can’t be undone.'),
    h('div', {class: 'wacts'}, h('button', {class: 'btn danger', type: 'button', id: 'deleteYes', onclick: deleteAll}, 'Delete everything'),
      h('button', {class: 'btn', type: 'button', onclick: () => { fill(wrap); const b = $('#deleteAll'); if (b) b.focus(); }}, 'Keep my data'),
      st.dl ? h('button', {class: 'lnk', type: 'button', onclick: exportAll}, 'Download it first') : null)));
  const y = $('#deleteYes'); if (y) y.focus();
}
async function deleteAll() {
  const btn = $('#deleteYes'); if (btn) btn.disabled = true;
  clearTimeout(uTimer); uDelta = null;
  for (const t of pending.values()) clearTimeout(t);
  pending.clear();
  // Writes already on their way finish first, so none of them can bring a document back afterwards.
  await Promise.all([...chains.values(), uChain].map(c => c.catch(() => {})));
  const ids = [...st.docs.keys()], specials = Object.keys(SPECIAL);
  let failed = 0;
  if (st.store === 'db' && col) {
    for (const id of ids.concat(specials)) { try { await col.doc(id).delete(); } catch (e) { failed++; } }
    if (dbApi && myId) { try { await dbApi.doc('feedback/' + myId).delete(); } catch (e) {} }
  }
  try { localStorage.removeItem(LKEY); localStorage.removeItem(PKEY); } catch (e) {}
  st.docs.clear(); st.asks.clear(); written.clear();
  for (const k of specials) { try { SPECIAL[k].load(null); } catch (e) {} }
  closeDlg(); setMode('write'); openDoc(makeSample());
  toast(failed ? 'Some of it couldn’t be deleted. Try again.' : 'All your data was deleted.');
}
