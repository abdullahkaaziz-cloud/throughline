// ---- your progress: how your writing is changing across essays ----
// Worked out here, from every reviewed essay's drafts: how many notes of each kind its first full review found per
// 1,000 words (so first drafts are compared with first drafts), and how many of them later drafts fixed.
// "Find my habits" asks Claude, only when pressed, for the habits behind the notes, each tied to real notes; the
// answer is one record beside the documents ('growth') and goes out of date as more essays are reviewed.
const progEl = $('#progress');
const PGROUP = GROUPS.filter(([g]) => g !== 'all').map(([g, label]) => ({g, label}));
const groupLabel = g => (PGROUP.find(x => x.g === g) || {label: ''}).label;
const MIN_WORDS = 150;
const sampleCopy = d => !!(d.activity && d.activity.imported && d.activity.imported.sample);

// ---- the numbers ----
function progressData() {
  const rows = [];
  for (const d of essayDocs()) {
    if (d.isSample || sampleCopy(d)) continue;   // the sample essay isn't the writer's own
    const H = d.history ? d.history.list.filter(s => s.tier !== 'sample') : [];
    let first = H.find(s => s.kind !== 'recheck'), last = H[H.length - 1];
    if (!first) {   // reviewed before drafts were kept: the current review stands in for the first
      if (!d.review || d.review.tier === 'sample' || !Array.isArray(d.review.issues)) continue;
      const marks = d.marks || {};
      first = last = {at: d.review.at || d.updatedAt, words: words(d.text),
        notes: d.review.issues.map(is => ({t: is.type, k: noteKey(is.type, is.qa), x: is.title, q: is.qa, m: hasOwn(marks, is.id) ? marks[is.id] : null}))};
    }
    if (!(first.words >= MIN_WORDS)) continue;
    const per = Object.create(null);
    for (const G of PGROUP) per[G.g] = 0;
    for (const n of first.notes) if (hasOwn(TYPES, n.t)) per[TYPES[n.t].g]++;
    for (const G of PGROUP) per[G.g] = per[G.g] / first.words * 1000;
    const fixed = last !== first ? compareNotes(first.notes, last.notes).fixed.length : first.notes.filter(n => n.m === 'applied').length;
    rows.push({d, at: first.at || d.createdAt || 0, words: first.words, n: first.notes.length, per, total: first.notes.length / first.words * 1000, fixed, drafts: H.length || 1, first, last});
  }
  return rows.sort((a, b) => a.at - b.at);
}
const rate = v => (Math.round(v * 10) / 10).toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1});
// Latest first draft against the first ones (the first essay, or the mean of the first two once there are three).
function change(rows, f) {
  const n = rows.length; if (n < 2) return null;
  const base = rows.slice(0, n >= 3 ? 2 : 1), a = base.reduce((s, r) => s + f(r), 0) / base.length, b = f(rows[n - 1]);
  const since = base.length > 1 ? 'your first two essays' : 'your first essay';
  if (!a) return b ? {dir: 1, text: 'new since ' + since} : {dir: 0, text: 'none so far'};
  if (!b) return {dir: -1, text: 'none in your latest essay'};
  const p = Math.round((b - a) / a * 100);
  return Math.abs(p) < 10 ? {dir: 0, text: 'about the same as ' + since} : p < 0 ? {dir: -1, text: (-p) + '% fewer than ' + since} : {dir: 1, text: p + '% more than ' + since};
}

// ---- the habits: notes sent to Claude, and the record kept of its answer ----
function habitNotes(rows) {
  const out = [];
  for (const r of rows.slice(-12).reverse()) {
    const seen = new Set();
    for (const n of r.first.notes.concat(r.last === r.first ? [] : r.last.notes)) {
      if (!hasOwn(TYPES, n.t) || seen.has(n.k)) continue;
      seen.add(n.k);
      out.push({doc: r.d.id, title: r.d.title || 'Untitled essay', at: r.at, t: n.t, k: n.k, x: clip(n.x, 90), q: clip(n.q, 200)});
      if (out.length >= 160) break;
    }
    if (out.length >= 160) break;
  }
  out.sort((a, b) => a.at - b.at);
  out.forEach((x, i) => { x.id = 'N' + (i + 1); });
  return out;
}
const habitSig = notes => hash(notes.map(x => x.doc + ':' + x.k).sort().join('|'));
function habitPrompt(notes, n) {
  const month = t => new Date(t).toLocaleDateString('en-GB', {month: 'short', year: 'numeric'});
  const lines = notes.map(x => x.id + ' [' + TYPES[x.t].label + ' · essay “' + clip(x.title, 80) + '” · ' + month(x.at) + '] ' + x.x + (x.q ? ' — “' + x.q + '”' : ''));
  return HABIT_RULES.replace('{n}', n) + '\n\nNOTES (from the reviews of ' + plural(new Set(notes.map(x => x.doc)).size, 'essay') + ', oldest first):\n<notes>\n' + fence(lines.join('\n')) + '\n</notes>';
}
function cleanGrowth(x) {
  const r = plainObj(x);
  if (r.kind !== 'growth') return null;
  const habits = (Array.isArray(r.habits) ? r.habits : []).slice(0, 6).map(h0 => {
    const o = plainObj(h0), title = clip(o.title, 80);
    const ex = (Array.isArray(o.ex) ? o.ex : []).slice(0, 4).map(e0 => { const e = plainObj(e0); return safeId(e.doc) && hasOwn(TYPES, e.t) ? {doc: e.doc, t: e.t, x: clip(e.x, 90), q: clip(e.q, 300)} : null; }).filter(Boolean);
    return title && HABIT_GROUPS.includes(o.group) && ex.length ? {title, group: o.group, detail: clip(o.detail, 300), tip: clip(o.tip, 240), ex} : null;
  }).filter(Boolean);
  return {at: num(r.at, 0), sig: typeof r.sig === 'string' ? r.sig.slice(0, 24) : '', habits};
}
function growthRecord() { return Object.assign({kind: 'growth', v: 1}, st.growth); }
SPECIAL.growth = {load: x => { st.growth = x ? cleanGrowth(x) : null; }, out: () => st.growth ? growthRecord() : null, render: () => { if (st.mode === 'progress') renderProgress(); }};
async function saveGrowth() { try { await saveSpecial('growth'); } catch (e) { toast('Couldn’t save your habits. They stay until you reload.'); } }
async function runHabits() {
  if (st.habitRun) return;
  const rows = progressData(), notes = habitNotes(rows);
  if (rows.length < 2 || notes.length < 6) { toast('Review at least two essays first.'); return; }
  if (st.ai === 'pending') await capsReady;
  if (!sampleFn || st.ai !== 'ready') { toast(st.aiWhy || 'AI isn’t available in this view.'); return; }
  const tier = pickTier(), R = st.habitRun = {ctl: new AbortController(), t0: Date.now()};
  st.habitErr = null; renderProgress();
  const tick = setInterval(() => { const b = $('#htime'), s = Math.floor((Date.now() - R.t0) / 1000); if (b) b.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 1000);
  try {
    const refs = Object.create(null); for (const x of notes) refs[x.id] = {g: TYPES[x.t].g};
    const opts = {signal: R.ctl.signal}; if (tier) opts.modelTier = tier;
    const found = await askClaude('habits', null, habitPrompt(notes, 5), opts, raw => { const v = validateHabits(raw, refs, 5); if (!v.length) throw {code: 'invalid_json'}; return v; });
    const byId = new Map(notes.map(x => [x.id, x]));
    st.growth = {at: Date.now(), sig: habitSig(notes), habits: found.map(hb => ({title: hb.title, group: hb.group, detail: hb.detail, tip: hb.tip,
      ex: hb.notes.map(id => { const x = byId.get(id); return {doc: x.doc, t: x.t, x: x.x, q: x.q}; })}))};
    saveGrowth();
    toast('Found ' + plural(found.length, 'habit') + '.');
  } catch (err) {
    if (!(err && err.code === 'cancelled')) { st.habitErr = err; noteAiError(err); }
  } finally { clearInterval(tick); st.habitRun = null; renderProgress(); }
}

// ---- the view ----
function openProgress() { closeMenus(); setMode('progress'); }
function renderProgress() {
  if (st.mode !== 'progress') return;
  const rows = progressData(), n = rows.length, last = rows[n - 1];
  const head = h('div', {class: 'chead2'}, h('button', {class: 'btn sm ghost', type: 'button', onclick: () => setMode('write')}, '← Back to the essay'), h('h2', null, 'Your progress'));
  if (!n) {
    fill(progEl, head, h('p', {class: 'rnote'}, 'Review one of your essays to start. Each review adds to this page: how often each kind of note comes up in your first drafts, what your later drafts fix, and the habits behind them.' +
      (essayDocs().some(sampleCopy) ? ' Your copy of the sample essay doesn’t count, because you didn’t write it.' : '')));
    return;
  }
  const vivas = essayDocs().flatMap(d => (d.defences || []).filter(s => s.done)), qs = vivas.flatMap(s => s.qs), strong = vivas.reduce((s, v) => s + tally(v).strong, 0);
  const tc = change(rows, r => r.total), fixed = rows.reduce((s, r) => s + r.fixed, 0), drafts = rows.reduce((s, r) => s + r.drafts, 0);
  const tile = (k, v, sub) => h('div', {class: 'rtile'}, h('span', {class: 'lbl'}, k), h('b', null, v), sub ? h('span', {class: 'sub'}, sub) : null);
  const yMax = niceRate(Math.max(...rows.flatMap(r => PGROUP.map(G => r.per[G.g]))));
  fill(progEl, head,
    h('p', {class: 'rsub'}, plural(n, 'reviewed essay') + ' · ' + fmtDay(dayKey(rows[0].at)) + (n > 1 ? ' – ' + fmtDay(dayKey(last.at)) : '')),
    h('div', {class: 'rtiles'},
      tile('Essays reviewed', String(n), plural(drafts, 'draft') + ' in all'),
      tile('Notes per 1,000 words', rate(last.total), tc ? arrow(tc) + tc.text : 'in your first draft of “' + trunc(last.d.title || 'Untitled essay', 40) + '”'),
      tile('Notes fixed in later drafts', String(fixed), 'across your essays'),
      tile('Viva answers that held up', qs.length ? strong + ' of ' + qs.length : '–', qs.length ? 'in ' + plural(vivas.length, 'viva') : 'press Defend it after a review')),
    h('section', {class: 'rsec'}, h('h3', null, 'How each kind of note is changing'),
      n > 1 ? h('p', {class: 'smeta'}, 'Notes per 1,000 words in each essay’s first draft, oldest essay on the left. Lower is better.') : null,
      n > 1 ? trendsEl(rows, yMax) : h('p', {class: 'khint'}, 'Review another essay to see how your writing changes from one to the next.')),
    habitsEl(rows),
    h('details', {class: 'rlist'}, h('summary', null, 'Essay by essay'),
      h('div', {class: 'rscroll'}, h('table', {class: 'rtable'},
        h('thead', null, h('tr', null, h('th', null, 'Essay'), h('th', null, 'Reviewed'), h('th', {class: 'num'}, 'Words'), PGROUP.map(G => h('th', {class: 'num'}, G.label)), h('th', {class: 'num', title: 'Notes fixed in later drafts'}, 'Fixed later'))),
        h('tbody', null, rows.slice().reverse().map(r => h('tr', null,
          h('td', null, h('button', {class: 'lnk', type: 'button', onclick: () => openAt(r.d, '')}, trunc(r.d.title || 'Untitled essay', 48))), h('td', null, fmtDay(dayKey(r.at))),
          h('td', {class: 'num'}, r.words.toLocaleString()), PGROUP.map(G => h('td', {class: 'num'}, rate(r.per[G.g]))), h('td', {class: 'num'}, r.fixed))))))),
    h('p', {class: 'fine'}, 'Each essay counts once, at its first full review, so first drafts are compared with first drafts. Essays under ' + MIN_WORDS + ' words are left out.'));
  if (n > 1) drawTrends(rows, yMax);
}
const arrow = c => c.dir < 0 ? '↓ ' : c.dir > 0 ? '↑ ' : '';
const niceRate = v => [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50].find(s => s >= v) || Math.ceil(v / 10) * 10;
// Small multiples on one shared scale: a panel per kind of note, one readout for all of them.
function trendsEl(rows, yMax) {
  const read = h('p', {class: 'rread', id: 'pread', 'aria-live': 'polite'});
  const grid = h('div', {class: 'pgrid', tabindex: '0', role: 'group', 'aria-label': 'Notes per 1,000 words, essay by essay. Use the arrow keys to read each essay.'},
    PGROUP.map(G => { const c = change(rows, r => r.per[G.g]);
      return h('div', {class: 'ppanel'}, h('div', {class: 'phead'}, h('i', {class: 'pkey g-' + G.g}), h('span', null, G.label)),
        h('div', {class: 'pval'}, h('b', null, rate(rows[rows.length - 1].per[G.g]))),
        h('p', {class: 'pchg'}, c ? arrow(c) + c.text : ''), h('div', {class: 'pchart', data: {g: G.g}})); }));
  return h('div', {class: 'ptrends'}, read, grid);
}
function drawTrends(rows, yMax) {
  const grid = $('#progress .pgrid'), read = $('#pread'); if (!grid) return;
  const n = rows.length, TOP = 12, PH = 64, pad = 10, marks = [];
  for (const box of grid.querySelectorAll('.pchart')) {
    const g = box.dataset.g, W = Math.max(160, Math.round(box.clientWidth || 220)), x = i => pad + i * (W - 2 * pad) / (n - 1), y = v => TOP + PH - v / yMax * PH;
    const svg = sv('svg', {class: 'rchart', viewBox: '0 0 ' + W + ' ' + (TOP + PH + 1), 'aria-hidden': 'true'});
    const pts = rows.map((r, i) => [x(i), y(r.per[g])]);
    const cross = sv('line', {class: 'rcross', y1: TOP - 2, y2: TOP + PH, visibility: 'hidden'}), hi = sv('circle', {class: 'pdot g-' + g, r: 4, visibility: 'hidden'});
    svg.append(sv('line', {class: 'rgrid', x1: 0, x2: W, y1: TOP + .5, y2: TOP + .5}), sv('line', {class: 'raxisl', x1: 0, x2: W, y1: TOP + PH + .5, y2: TOP + PH + .5}),
      Object.assign(sv('text', {class: 'rtick', x: W, y: TOP - 3, 'text-anchor': 'end'}), {textContent: String(yMax)}),
      sv('polyline', {class: 'pline g-' + g, points: pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}), cross,
      sv('circle', {class: 'pdot g-' + g, cx: pts[n - 1][0], cy: pts[n - 1][1], r: 4}), hi);
    box.append(svg);
    marks.push({cross, hi, pts});
  }
  const show = (i, on) => {
    for (const m of marks) {
      m.cross.setAttribute('x1', m.pts[i][0]); m.cross.setAttribute('x2', m.pts[i][0]); m.cross.setAttribute('visibility', on ? 'visible' : 'hidden');
      m.hi.setAttribute('cx', m.pts[i][0]); m.hi.setAttribute('cy', m.pts[i][1]); m.hi.setAttribute('visibility', on ? 'visible' : 'hidden');
    }
    const r = rows[i];
    fill(read, h('span', null, '“' + trunc(r.d.title || 'Untitled essay', 60) + '”, reviewed ' + fmtDay(dayKey(r.at)) + ': '),
      PGROUP.map((G, j) => [j ? ' · ' : '', G.label + ' ', h('b', null, rate(r.per[G.g]))]), ' per 1,000 words');
    grid.dataset.i = i;
  };
  const at = e => { const c = e.target.closest && e.target.closest('.pchart svg'); if (!c) return null; const b = c.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.round((e.clientX - b.left) / b.width * (n - 1)))); };
  grid.addEventListener('pointermove', e => { const i = at(e); if (i != null) show(i, true); });
  grid.addEventListener('pointerdown', e => { const i = at(e); if (i != null) show(i, true); });
  grid.addEventListener('pointerleave', () => show(n - 1, false));
  grid.addEventListener('blur', () => show(n - 1, false));
  grid.addEventListener('keydown', e => {
    const i = +grid.dataset.i, j = e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowRight' ? i + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (j == null) return; e.preventDefault(); show(Math.max(0, Math.min(n - 1, j)), true);
  });
  show(n - 1, false);
}
function habitsEl(rows) {
  const G = st.growth, notes = habitNotes(rows), off = st.ai === 'denied' || st.ai === 'off', ready = rows.length >= 2 && notes.length >= 6;
  const kids = [h('h3', null, 'Your habits')];
  if (st.habitRun) kids.push(h('section', {class: 'prog', 'aria-live': 'polite'}, h('div', {class: 'pbar'}, h('i')),
    h('div', {class: 'ptxt'}, h('b', null, 'Looking for patterns in ' + plural(notes.length, 'note') + '…'), h('span', {id: 'htime'}, '0:00')),
    h('button', {class: 'btn sm', type: 'button', onclick: () => st.habitRun && st.habitRun.ctl.abort()}, 'Stop')));
  if (st.habitErr) kids.push(h('section', {class: 'errc', role: 'alert'}, h('b', null, 'That didn’t finish'), h('p', null, errText(st.habitErr)),
    isHard(st.habitErr) ? null : h('button', {class: 'btn sm', type: 'button', onclick: runHabits}, 'Try again')));
  if (!G || !G.habits.length) {
    if (!st.habitRun) kids.push(h('div', {class: 'hempty'},
      h('p', null, ready ? 'Claude can read the notes from your ' + plural(rows.length, 'essay') + ' and name the habits behind them, each with the notes that show it and one thing to try next time.'
        : 'Once two essays have been reviewed, Claude can read their notes and name the habits behind them.'),
      h('button', {class: 'btn sm primary', type: 'button', id: 'habitsBtn', onclick: runHabits, disabled: !ready || off || !!st.habitRun}, 'Find my habits')));
    return h('section', {class: 'rsec'}, kids);
  }
  const stale = G.sig !== habitSig(notes);
  kids.push(h('div', {class: 'hgrid'}, G.habits.map(hb => h('article', {class: 'hcard'},
    h('div', {class: 'phead'}, h('i', {class: 'pkey g-' + hb.group}), h('span', null, groupLabel(hb.group))),
    h('h4', null, hb.title), hb.detail ? h('p', null, hb.detail) : null,
    hb.tip ? h('p', {class: 'htip'}, h('b', null, 'Next time: '), hb.tip) : null,
    h('ul', {class: 'hex'}, hb.ex.map(e => { const d = st.docs.get(e.doc);
      return h('li', null, d ? h('button', {class: 'lnk', type: 'button', onclick: () => openAt(d, e.q)}, trunc(d.title || 'Untitled essay', 50)) : h('span', {class: 'smeta'}, 'An essay you’ve since deleted'),
        e.q ? h('span', {class: 'hq'}, '“' + trunc(e.q, 160) + '”') : h('span', {class: 'hq'}, e.x)); }))))),
    h('p', {class: 'smeta'}, (stale ? 'You’ve reviewed more since these were found. ' : '') + 'Found by Claude · ' + ago(G.at) + ' · ',
      h('button', {class: 'lnk', type: 'button', id: 'habitsAgain', onclick: runHabits, disabled: !ready || off || !!st.habitRun}, 'Find them again')));
  return h('section', {class: 'rsec'}, kids);
}
