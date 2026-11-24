// ---- draft timeline: every review keeps a snapshot of the text and its notes ----
// The Notes view shows the drafts as a strip of bars (open notes by colour, the ones you dealt with pale) and what
// each review fixed and found. Compare lines two drafts up paragraph by paragraph, with the notes between them.
// Re-checks (13-review.js) use the last snapshot to re-read only the paragraphs that changed.
const cmpEl = $('#compare');
const TL_GROUPS = ['rel', 'logic', 'evid', 'clar', 'gram'];
const histOf = d => d.history || (d.history = {paras: Object.create(null), list: []});
const lastDraft = d => d.history && d.history.list.length ? d.history.list[d.history.list.length - 1] : null;
// What the review was checked against: if this changes, a re-check isn't enough.
function ctxSig(d) { return hash(contextDocs(d).map(x => x.id + ':' + hash(x.text || '')).join('|') + '#' + (d.brief ? d.brief.text : '')); }
function snapshot(d, text, kind) {
  const H = histOf(d), rv = d.review;
  const ps = textParas(text).map(p => { const k = paraHash(p); H.paras[k] = p; return k; });
  const s = {id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: rv.at, kind, tier: rv.tier, words: words(text), ps,
    notes: rv.issues.map(is => ({id: is.id, k: noteKey(is.type, is.qa), t: is.type, x: clip(is.title, 90), q: clip(is.qa, 160), m: null}))};
  H.list.push(s);
  while (H.list.length > 30) H.list.shift();
  const keep = new Set(H.list.flatMap(x => x.ps || []));
  for (const k of Object.keys(H.paras)) if (!keep.has(k)) delete H.paras[k];
  rv.draft = s.id;
}
// Before a new review replaces the notes, the last draft records what you did with them.
function markLastDraft(d) {
  const s = lastDraft(d);
  if (s && d.review && d.review.draft === s.id) for (const n of s.notes) n.m = (d.marks || {})[n.id] || null;
}
// The latest draft's notes follow your marks as you work; earlier drafts keep theirs.
function draftNotes(d, i) {
  const s = d.history.list[i], live = d.review && d.review.draft === s.id;
  return live ? s.notes.map(n => Object.assign({}, n, {m: (d.marks || {})[n.id] || null})) : s.notes;
}
function changedSinceDraft(d) { const s = lastDraft(d); return !!s && !!d.review && d.review.draft === s.id && d.review.textHash !== hash(ed.value); }

// ---- the strip in the Notes view ----
function timelineEl(d) {
  const H = d.history; if (!H || !H.list.length) return null;
  const L = H.list, n = L.length, sel = st.tlSel >= 0 && st.tlSel < n ? st.tlSel : n - 1, now = changedSinceDraft(d);
  const max = Math.max(4, ...L.map(s => s.notes.length)), px = k => Math.max(3, Math.round(k / max * 52));
  const cols = L.map((s, i) => {
    const notes = draftNotes(d, i), open = notes.filter(x => !x.m), done = notes.length - open.length;
    const delta = i ? compareNotes(L[i - 1].notes, s.notes) : null;
    return h('li', {class: 'tcol' + (i === sel ? ' on' : '')},
      h('button', {type: 'button', class: 'tbtn', 'aria-pressed': String(i === sel), title: 'Draft ' + (i + 1) + ' · ' + ago(s.at),
          'aria-label': 'Draft ' + (i + 1) + ', ' + ago(s.at) + ': ' + plural(open.length, 'open note') + (done ? ', ' + done + ' dealt with' : ''),
          onclick: () => { st.tlSel = i; renderRail(); }},
        h('span', {class: 'tbar'}, TL_GROUPS.map(g => { const c = open.filter(x => TYPES[x.t].g === g).length; return c ? h('i', {style: 'height:' + px(c) + 'px;background:var(--' + g + ')'}) : null; }),
          done ? h('i', {class: 'tdone', style: 'height:' + px(done) + 'px'}) : null, notes.length ? null : h('i', {class: 'tnone'})),
        h('span', {class: 'tnum'}, i + 1)),
      h('span', {class: 'tdelta'}, delta && delta.fixed.length ? h('b', {class: 'fx', title: plural(delta.fixed.length, 'note') + ' fixed since draft ' + i}, '−' + delta.fixed.length) : null,
        delta && delta.added.length ? h('b', {class: 'nw', title: plural(delta.added.length, 'new note')}, '+' + delta.added.length) : null));
  });
  if (now) cols.push(h('li', {class: 'tcol tnow'}, h('span', {class: 'tbar'}, h('i', {class: 'tpending'})), h('span', {class: 'tnum'}, 'now')));
  const s = L[sel];
  return h('section', {class: 'tline'},
    h('div', {class: 'thead'}, h('span', {class: 'lbl'}, 'Drafts'),
      n > 1 || now ? h('button', {class: 'lnk', id: 'cmpBtn', onclick: () => openCompare(sel)}, 'Compare') : null),
    h('ol', {class: 'tstrip', 'aria-label': 'Your drafts, oldest first'}, cols),
    h('p', {class: 'smeta'}, 'Draft ' + (sel + 1) + ' · ' + (s.kind === 'recheck' ? 'a re-check' : 'a full review') + ' · ' + ago(s.at) + ' · ' + plural(s.words, 'word'),
      n === 1 && !now ? ' · your next review adds draft 2' : ''));
}

// ---- Compare: two drafts side by side ----
function openCompare(sel) {
  const d = st.cur, n = d.history.list.length, now = changedSinceDraft(d), b = now ? 'now' : n - 1;
  const a = b === 'now' ? Math.min(sel, n - 1) : sel < n - 1 ? sel : n - 2;
  st.cmp = {a: Math.max(0, a), b, show: 'fixed', open: new Set()};
  setMode('compare');
}
function cmpSide(d, v) {
  if (v === 'now') { const texts = textParas(ed.value); return {texts, hs: texts.map(paraHash)}; }
  const s = d.history.list[v];
  return s && s.ps ? {texts: s.ps.map(k => d.history.paras[k] || ''), hs: s.ps} : null;
}
function renderCompare() {
  if (st.mode !== 'compare' || !st.cur) return;
  const d = st.cur, L = d.history ? d.history.list : [], C = st.cmp;
  if (!L.length || !C) { setMode('write'); return; }
  const now = changedSinceDraft(d), opts = [...L.keys()].concat(now ? ['now'] : []);
  if (!opts.includes(C.a)) C.a = 0;
  if (!opts.includes(C.b)) C.b = opts[opts.length - 1];
  const label = v => v === 'now' ? 'Now, not reviewed yet' : 'Draft ' + (v + 1) + ' · ' + ago(L[v].at);
  const pick = which => h('select', {class: 'csel', 'aria-label': which === 'a' ? 'From' : 'To',
      onchange: e => { C[which] = e.target.value === 'now' ? 'now' : +e.target.value; C.open = new Set(); renderCompare(); }},
    opts.map(v => h('option', {value: String(v), selected: C[which] === v}, label(v))));
  const A = cmpSide(d, C.a), B = cmpSide(d, C.b);
  const nA = C.a === 'now' ? null : draftNotes(d, C.a), nB = C.b === 'now' ? null : draftNotes(d, C.b), N = nA && nB ? compareNotes(nA, nB) : null;
  const cats = [['fixed', 'Fixed', '--ok'], ['open', 'Still open', '--ink2'], ['added', 'New', '--rel'], ['dismissed', 'Dismissed', '--ink3']];
  if (N && !N[C.show].length) C.show = (cats.find(([k]) => N[k].length) || ['fixed'])[0];
  const notes = N ? h('section', {class: 'cnotes', 'aria-label': 'Notes between the two drafts'},
      h('div', {class: 'cchips'}, cats.map(([k, name, c]) => h('button', {type: 'button', class: 'cchip', 'aria-pressed': String(C.show === k), style: '--cc:var(' + c + ')',
        onclick: () => { C.show = k; renderCompare(); }}, h('b', null, N[k].length), ' ' + name))),
      N[C.show].length ? h('ul', {class: 'clist'}, N[C.show].map(x => h('li', {style: '--tc:var(' + TYPES[x.t].c + ')'},
        h('span', {class: 'kind'}, h('i', {class: 'dot'}), TYPES[x.t].label, x.m === 'applied' ? h('span', {class: 'where'}, 'suggestion applied') : null),
        h('span', {class: 'ct'}, x.x || TYPES[x.t].label), x.q ? h('span', {class: 'cq'}, '“' + trunc(x.q, 160) + '”') : null))) : null)
    : h('p', {class: 'khint'}, 'Review this version to see which notes it fixes.');
  fill(cmpEl,
    h('div', {class: 'chead2'}, h('button', {class: 'btn sm ghost', type: 'button', onclick: () => setMode('write')}, '← Back to the essay'), h('h2', null, 'Compare drafts')),
    h('div', {class: 'cpick'}, pick('a'), h('span', {class: 'carrow', 'aria-hidden': 'true'}, '→'), pick('b')),
    notes,
    A && B ? textCompareEl(A, B, label(C.a), label(C.b)) : h('p', {class: 'khint'}, 'The text of this draft wasn’t kept, because the essay is long. Its notes are above.'));
}
function textCompareEl(A, B, la, lb) {
  const rows = alignParas(A.hs, B.hs), out = [];
  let run = [], changed = 0, added = 0, removed = 0;
  const flush = () => {
    if (!run.length) return;
    const r = run, key = r[0].b; run = [];
    out.push(st.cmp.open.has(key) ? h('div', {class: 'crun open'}, r.map(x => h('p', {class: 'cpara'}, B.texts[x.b])))
      : h('button', {type: 'button', class: 'crun', onclick: () => { st.cmp.open.add(key); renderCompare(); }}, plural(r.length, 'paragraph') + ' unchanged · show'));
  };
  for (const r of rows) {
    if (r.same) { run.push(r); continue; }
    flush();
    const a = r.a >= 0 ? A.texts[r.a] : null, b = r.b >= 0 ? B.texts[r.b] : null;
    if (a != null && b != null) {
      changed++;
      const dd = wordDiff(a, b), rewrite = dd.length === 1 && dd[0][0] === '+';
      out.push(h('div', {class: 'crow'},
        h('p', {class: 'cpara old'}, rewrite ? h('del', null, a) : dd.map(([k, s]) => k === '+' ? null : k === '-' ? h('del', null, s) : s)),
        h('p', {class: 'cpara new'}, rewrite ? h('ins', null, b) : dd.map(([k, s]) => k === '-' ? null : k === '+' ? h('ins', null, s) : s))));
    } else if (a != null) { removed++; out.push(h('div', {class: 'crow'}, h('p', {class: 'cpara old'}, h('del', null, a)), h('p', {class: 'cpara none'}, 'Removed'))); }
    else { added++; out.push(h('div', {class: 'crow'}, h('p', {class: 'cpara none'}, 'Added'), h('p', {class: 'cpara new'}, h('ins', null, b)))); }
  }
  flush();
  const wa = words(A.texts.join(' ')), wb = words(B.texts.join(' '));
  const stats = [plural(changed, 'paragraph') + ' edited', added ? added + ' added' : '', removed ? removed + ' removed' : '', wa.toLocaleString() + ' → ' + plural(wb, 'word')].filter(Boolean).join(' · ');
  return h('section', {class: 'ctext', 'aria-label': 'Text changes'},
    h('p', {class: 'smeta'}, changed || added || removed ? stats : 'The text is the same in both.'),
    h('div', {class: 'ccols', 'aria-hidden': 'true'}, h('span', null, la), h('span', null, lb)),
    out);
}
