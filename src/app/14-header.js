// ---- header bits ----
function renderDocBtn() { $('#docName').textContent = (st.cur && st.cur.title) || 'Untitled essay'; }
function renderMeta() {
  const d = st.cur, n = words(ed.value);
  fill(metaEl,
    d.isSample ? h('span', {class: 'tag'}, 'Sample essay') : null,
    h('span', null, n.toLocaleString() + (n === 1 ? ' word' : ' words')),
    d.isSample ? h('span', null, 'Edit it and it becomes your own copy') : h('span', {id: 'save'}, st.saveText),
    coarse && ed.value.trim() ? h('button', {class: 'btn sm ghost', onclick: toggleEdit}, st.readOnly ? 'Edit text' : 'Done editing') : null);
}
function toggleEdit() { st.readOnly = !st.readOnly; ed.readOnly = st.readOnly; renderMeta(); if (!st.readOnly) ed.focus(); }
function renderAiBtn() {
  $('#aiDot').dataset.s = st.ai;
  aiBtn.title = st.ai === 'ready' ? 'Reviews run on your Claude plan' : st.ai === 'pending' ? 'Connecting to Claude…' : st.aiWhy;
}

