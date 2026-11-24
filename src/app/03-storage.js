// ---- storage: your own space in this page's database, else this browser, else memory ----
const pending = new Map(), chains = new Map(), written = new Map();
function setSave(t) { st.saveText = t; const el = $('#save'); if (el) el.textContent = t; }
function savedText() { return st.store === 'db' ? 'Saved' : st.store === 'local' ? 'Saved in this browser' : 'Not saved in this view'; }
function persist(d, delay) {
  if (!d || d.unsaved) return;
  clearTimeout(pending.get(d.id));
  setSave('Saving…');
  pending.set(d.id, setTimeout(() => { pending.delete(d.id); flush(d.id); }, delay == null ? 900 : delay));
}
function flush(id) {
  const d = st.docs.get(id); if (!d) return;
  const body = serial(d), json = JSON.stringify(body);
  if (written.get(id) === json) { if (!pending.size) setSave(savedText()); return; }
  const run = () => writeDoc(id, body, json, false);
  chains.set(id, (chains.get(id) || Promise.resolve()).then(run, run));
}
async function writeDoc(id, body, json, retried) {
  if (bytes(json) > 250000) { setSave('Too long to save'); return; }
  try {
    if (st.store === 'db') await col.doc(id).set(body);
    else if (st.store === 'local') { if (!writeLocal()) throw {code: 'local'}; }
    else { setSave(savedText()); return; }
    written.set(id, json);
    if (!pending.size) setSave(savedText());
  } catch (e) {
    const c = e && e.code;
    if (c === 'unavailable' && !retried) { await wait(700 + Math.random() * 900); return writeDoc(id, body, json, true); }
    if (c === 'invalid_argument' || c === 'revoked') st.store = 'memory';
    setSave(c === 'quota_exceeded' ? 'Storage is full' : c === 'invalid_argument' ? 'View only: changes aren’t saved' : c === 'revoked' ? 'Saving is off in this view' : c === 'local' ? 'Browser storage is full' : 'Couldn’t save; will retry on your next change');
  }
}
function readLocal() { try { const raw = localStorage.getItem(LKEY); return raw ? JSON.parse(raw) : []; } catch (e) { return null; } }
function writeLocal() {
  try { localStorage.setItem(LKEY, JSON.stringify(sortedDocs().map(d => Object.assign({id: d.id}, serial(d))).concat(st.rmap ? [Object.assign({id: 'rmap'}, mapRecord())] : []))); return true; }
  catch (e) { return false; }
}
function startLocal() {
  const arr = readLocal();
  if (!Array.isArray(arr)) { st.store = 'memory'; st.loaded = true; setSave(''); return; }
  st.store = 'local';
  for (const x of arr) {
    if (x && x.id === 'rmap') { st.rmap = cleanRmap(x); continue; }
    const d = x && fromStored(String(x.id || newId()), x); if (d) st.docs.set(d.id, d);
  }
  st.loaded = true; onFirstLoad();
}
function startDb(db, uid) {
  st.store = 'db';
  col = db.collection('data/users/' + uid);
  setSave('Loading your essays…');
  const timer = setTimeout(() => { if (!st.loaded) setSave('Can’t reach your saved essays yet'); }, 10000);
  col.onSnapshot(snap => {
    clearTimeout(timer);
    let curChanged = false;
    for (const ch of snap.docChanges()) {
      const id = ch.doc.id;
      if (id === 'rmap') {
        if (ch.type === 'removed') st.rmap = null;
        else { try { st.rmap = cleanRmap(structuredClone(ch.doc.data())); } catch (e) {} }
        if (st.mode === 'map' && st.loaded) renderMap();
        continue;
      }
      if (ch.type === 'removed') { if (!(st.cur && st.cur.id === id)) st.docs.delete(id); continue; }
      let raw; try { raw = structuredClone(ch.doc.data()); } catch (e) { continue; }
      const d = fromStored(id, raw); if (!d) continue;
      written.set(id, JSON.stringify(serial(d)));
      const local = st.docs.get(id);
      if (local && ((local.updatedAt || 0) >= d.updatedAt || pending.has(id))) continue;
      if (st.cur && st.cur.id === id) {
        if (document.activeElement === ed || document.activeElement === titleIn) continue;
        Object.assign(st.cur, d); curChanged = true;
      } else st.docs.set(id, d);
    }
    if (!st.loaded) { st.loaded = true; setSave(''); onFirstLoad(); }
    else if (curChanged) loadEditor();
    if (!docMenu.hidden) renderDocMenu();
  }, () => { clearTimeout(timer); setSave('Can’t load your saved essays'); });
}
function onFirstLoad() {
  if (st.cur && st.cur.unsaved && !st.touched) { const r = sortedDocs()[0]; if (r) { openDoc(r); return; } }
  renderRail();
}

