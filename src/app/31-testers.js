// ---- testers: a first-visit welcome, feedback for whoever shared Throughline, and the owner's inbox ----
// Each tester's feedback is one record at feedback/<their id>: they write their own, and only the owner can
// read them all. Essays stay in data/users/<id>/, which nobody else can read, the owner included.
const dlgEl = $('#dlg'), inboxEl = $('#inbox');
const WKEY = 'throughline.welcomed.v1';
const FB_ABOUT = [['general', 'Throughline in general'], ['review', 'Review notes'], ['argument', 'Argument flow'], ['plan', 'Brainstorm board'],
  ['drafts', 'Drafts and Compare'], ['map', 'Research map'], ['viva', 'Defend it'], ['record', 'Writing record'], ['progress', 'Your progress']];
const FB_FOR_MODE = {plan: 'plan', compare: 'drafts', map: 'map', defend: 'viva', record: 'record', progress: 'progress'};
let dlgBack = null;
function openDlg(title, ...kids) {
  dlgBack = document.activeElement;
  fill(dlgEl.querySelector('.sheet'), h('div', {class: 'shead'}, h('b', {id: 'dlgTitle'}, title), h('button', {class: 'btn sm ghost', type: 'button', onclick: closeDlg}, 'Close')),
    h('div', {class: 'dlgbody'}, kids));
  dlgEl.hidden = false;
  const f = dlgEl.querySelector('textarea, .btn.primary'); if (f) f.focus({preventScroll: true});
}
function closeDlg() {
  if (dlgEl.hidden) return;
  dlgEl.hidden = true;
  if (dlgBack && dlgBack.isConnected && dlgBack.focus) dlgBack.focus({preventScroll: true});
  dlgBack = null;
}
dlgEl.addEventListener('pointerdown', e => { if (e.target === dlgEl) closeDlg(); });

// ---- the welcome, once per browser, for anyone but the owner ----
function maybeWelcome() {
  if (st.isOwner || !dlgEl.hidden) return;
  try { if (localStorage.getItem(WKEY)) return; localStorage.setItem(WKEY, '1'); } catch (e) {}
  const ai = st.ai === 'ready';
  openDlg('Welcome to Throughline',
    h('p', {class: 'wlead'}, 'Throughline reads your essay and marks what needs work, right where it is: contradictions, gaps in the argument, claims that need evidence, unclear sentences. It never rewrites your essay.'),
    h('ul', {class: 'wlist'},
      h('li', null, h('b', null, 'Your own Claude plan. '), ai ? 'Reviews run on your Claude plan, so they count toward your usage, not anyone else’s.' : 'Sign in to Claude to run reviews. They use your own plan.'),
      h('li', null, h('b', null, 'Private to you. '), st.store === 'db' ? 'Your essays are saved in your own space. Nobody else can open them, including whoever shared Throughline with you.'
        : 'Your essays are saved in this browser only, so use the same browser to come back to them.'),
      h('li', null, h('b', null, 'A test version. '), 'Tell us what works and what doesn’t: ', h('b', null, 'Send feedback'), ' is in the essay menu.')),
    h('div', {class: 'wacts'},
      h('button', {class: 'btn primary', type: 'button', id: 'welcomeSample', onclick: () => { closeDlg(); if (!(st.cur && st.cur.isSample)) openDoc(makeSample()); }}, 'Try the sample essay'),
      h('button', {class: 'btn', type: 'button', onclick: () => { closeDlg(); newEssay(); }}, 'Start my own essay')));
}

// ---- feedback ----
function cleanFeedback(x) {
  const r = plainObj(x);
  if (r.kind !== 'feedback') return null;
  const items = (Array.isArray(r.items) ? r.items : []).slice(-50).map(i0 => { const i = plainObj(i0), text = typeof i.text === 'string' ? i.text.slice(0, 2000).trim() : '';
    return text ? {at: num(i.at, 0), about: FB_ABOUT.some(([k]) => k === i.about) ? i.about : 'general', text} : null; }).filter(Boolean);
  return {name: clip(r.name, 80), items};
}
function openFeedback() {
  closeMenus();
  const about = h('select', {id: 'fbAbout'}, FB_ABOUT.map(([k, label]) => h('option', {value: k, selected: k === (FB_FOR_MODE[st.mode] || 'general')}, label)));
  const text = h('textarea', {id: 'fbText', rows: '6', maxlength: '2000', placeholder: 'What worked? What was confusing or wrong? What would make it better?'});
  const status = h('p', {class: 'smeta', id: 'fbStatus', 'aria-live': 'polite'});
  const canSave = st.store === 'db' && dbApi && myId;
  openDlg('Send feedback',
    h('label', {class: 'flab'}, h('span', null, 'About'), about), text,
    h('p', {class: 'smeta'}, canSave ? 'Whoever shared Throughline with you will read this, with your name. Leave out anything from your essays you’d rather they didn’t see.'
      : 'Feedback can’t be sent from this view. Copy it and send it to whoever shared Throughline with you.'),
    status,
    h('div', {class: 'wacts'}, canSave ? h('button', {class: 'btn primary', type: 'button', id: 'fbSend', onclick: () => sendFeedback(about.value, text, status)}, 'Send') : null,
      h('button', {class: 'btn' + (canSave ? '' : ' primary'), type: 'button', onclick: async () => {
        try { await navigator.clipboard.writeText(text.value); status.textContent = 'Copied.'; } catch (e) { status.textContent = 'Copying isn’t allowed here. Select the text and copy it yourself.'; } }}, 'Copy')));
}
async function sendFeedback(about, ta, status) {
  const text = ta.value.trim(), btn = $('#fbSend');
  if (!text) { status.textContent = 'Write something first.'; ta.focus(); return; }
  if (btn) btn.disabled = true; status.textContent = 'Sending…';
  try {
    const ref = dbApi.doc('feedback/' + myId), snap = await ref.get();
    const prev = snap && snap.exists ? cleanFeedback(snap.data()) : null, items = prev ? prev.items : [];
    items.push({at: Date.now(), about, text: text.slice(0, 2000)});
    await ref.set({kind: 'feedback', v: 1, name: myName, items: items.slice(-50)});
    closeDlg(); toast('Thanks. Your feedback was sent.');
  } catch (e) {
    if (btn) btn.disabled = false;
    status.textContent = 'It couldn’t be sent from here. Copy it and send it to whoever shared Throughline with you.';
  }
}

// ---- the owner's inbox ----
let inboxSub = null;
function openInbox() {
  closeMenus();
  if (!inboxSub && dbApi) {
    st.inbox = null;
    inboxSub = true;
    try {
      dbApi.collection('feedback').onSnapshot(snap => {
        const list = [];
        for (const d of snap.docs) { let f = null; try { f = cleanFeedback(structuredClone(d.data())); } catch (e) {} if (f && f.items.length) list.push(f); }
        st.inbox = list.sort((a, b) => b.items[b.items.length - 1].at - a.items[a.items.length - 1].at);
        renderInbox(); if (!docMenu.hidden) renderDocMenu();
      }, () => { st.inbox = []; st.inboxErr = true; renderInbox(); });
    } catch (e) { st.inbox = []; st.inboxErr = true; }
  }
  setMode('inbox');
}
function renderInbox() {
  if (st.mode !== 'inbox') return;
  const list = st.inbox, n = list ? list.reduce((s, f) => s + f.items.length, 0) : 0;
  const label = k => (FB_ABOUT.find(([x]) => x === k) || FB_ABOUT[0])[1];
  fill(inboxEl,
    h('div', {class: 'chead2'}, h('button', {class: 'btn sm ghost', type: 'button', onclick: () => setMode('write')}, '← Back to the essay'), h('h2', null, 'Feedback from testers')),
    h('p', {class: 'rsub'}, list == null ? 'Loading…' : st.inboxErr ? 'Feedback can’t be read in this view.' : n ? plural(n, 'message') + ' from ' + plural(list.length, 'tester') : 'No feedback yet. Testers send it from the essay menu.'),
    list && list.length ? h('div', {class: 'ibox'}, list.map(f => h('section', {class: 'icard'},
      h('h3', null, f.name || 'A tester'),
      h('ul', null, f.items.slice().reverse().map(i => h('li', null, h('span', {class: 'smeta'}, fmtWhen(i.at) + ' · ' + label(i.about)), h('p', null, i.text))))))) : null);
}
