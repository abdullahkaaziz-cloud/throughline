// ---- the writing record: how an essay was made, kept as it's written ----
// The editor logs where text came from (typed, pasted, Claude's accepted suggestions, outline headings, other
// edits), active time and length per day ('activity'). The record joins that with the drafts, the vivas and an
// honest account of how AI was used, and can be downloaded as a web page or copied as text.
const recEl = $('#record');
// Categories in fixed order, on the validated chart slots (--s1…--s5); 'Other' folds to gray.
const SOURCES = [['typed', 'Typed', '--s1'], ['pasted', 'Pasted', '--s2'], ['imported', 'From an imported file', '--s3'],
  ['ai', AI + '’s suggestions you accepted', '--s4'], ['outline', 'Headings from your outline', '--s5'], ['other', 'Other edits', '--s0']];
const ACT_DAYS = 200, ACT_LIST = 40;
const dayKey = t => { const x = new Date(t); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const heads = t => trunc(String(t || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 12).join(' '), 80);
const pushCap = (arr, x, max) => { arr.push(x); while (arr.length > max) arr.shift(); };
function actOf(d) { return d.activity || (d.activity = {since: Date.now(), days: Object.create(null), pastes: [], ai: [], imported: null}); }
function dayOf(A, t) {
  const k = dayKey(t);
  if (!hasOwn(A.days, k)) {
    A.days[k] = {ms: 0, typed: 0, pasted: 0, ai: 0, acc: 0, outline: 0, other: 0, deleted: 0, asks: 0, w: 0};
    const keys = Object.keys(A.days).sort(); while (keys.length > ACT_DAYS) delete A.days[keys.shift()];
  }
  return A.days[k];
}
// Text the app puts in (an accepted suggestion, outline headings) is counted as that, not as typing.
function appEdit(kind, text, fn) { st.appEdit = {kind, n: String(text).length, text}; try { fn(); } finally { st.appEdit = null; } }
function logAct(d, what) {
  if (!d || d.isSample) return;
  const day = dayOf(actOf(d), Date.now()); day[what]++;
  if (!day.w) day.w = words(d.text);
  persist(d);
}
function trackInput(e, d) {
  const now = Date.now(), A = actOf(d), day = dayOf(A, now), len = ed.value.length, type = (e && e.inputType) || '';
  const delta = len - (st.lastLen == null ? len : st.lastLen), data = e && typeof e.data === 'string' ? e.data : null;
  st.lastLen = len;
  // Active time: the gaps between edits, unless the writer stepped away for two minutes or more.
  if (st.lastInputAt && now - st.lastInputAt < 120000) day.ms += now - st.lastInputAt;
  st.lastInputAt = now; day.w = st.words != null ? st.words : words(ed.value);
  if (st.appEdit) {
    day[st.appEdit.kind] += st.appEdit.n;
    if (st.appEdit.kind === 'ai') { day.acc++; pushCap(A.ai, {at: now, n: st.appEdit.n, head: heads(st.appEdit.text)}, ACT_LIST); }
    return;
  }
  if (type === 'deleteByDrag') { st.dragOut = Math.max(0, -delta); return; }   // moving text inside the essay
  if (type === 'insertFromDrop' && st.dragOut) { st.dragOut = 0; return; }
  if (/^insertFrom(Paste|Drop)/.test(type)) {
    const txt = type.startsWith('insertFromPaste') && st.pasteText != null ? st.pasteText : data, n = txt != null ? txt.length : Math.max(0, delta);
    st.pasteText = null;
    if (n) { day.pasted += n; pushCap(A.pastes, {at: now, n, head: heads(txt || '')}, ACT_LIST); }
    return;
  }
  if (type === 'insertCompositionText') { day.typed += Math.max(0, delta); return; }
  if (type.startsWith('insert')) { day.typed += data != null ? data.length : Math.max(1, delta); return; }
  if (type.startsWith('delete')) { day.deleted += Math.max(0, -delta); return; }
  if (type.startsWith('history')) return;
  day.other += Math.max(0, delta);
}
ed.addEventListener('paste', e => { st.pasteText = (e.clipboardData && e.clipboardData.getData('text/plain')) || null; });
function cleanActivity(x) {
  const a = plainObj(x), D = plainObj(a.days), days = Object.create(null);
  for (const k of Object.keys(D).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().slice(-ACT_DAYS)) {
    const v = plainObj(D[k]); days[k] = {};
    for (const f of ['ms', 'typed', 'pasted', 'ai', 'acc', 'outline', 'other', 'deleted', 'asks', 'w']) days[k][f] = Math.max(0, Math.min(1e9, num(v[f], 0)));
  }
  const list = v => (Array.isArray(v) ? v : []).map(p0 => { const p = plainObj(p0); return {at: num(p.at, 0), n: Math.min(1e7, num(p.n, 0)), head: clip(p.head, 80)}; })
    .filter(p => p.at > 0 && p.n > 0).slice(-ACT_LIST);
  const im = plainObj(a.imported);
  return {since: num(a.since, 0), days, pastes: list(a.pastes), ai: list(a.ai),
    imported: a.imported ? {at: num(im.at, 0), chars: Math.max(0, Math.min(1e7, num(im.chars, 0))), words: Math.max(0, Math.min(1e7, num(im.words, 0))), name: clip(im.name, 160), sample: im.sample === true} : null};
}
// The record goes in before vivas and drafts; if a huge essay leaves too little room, the quoted openings go first.
function activityOut(a, room) {
  if (!a) return null;
  if (bytes(JSON.stringify(a)) <= room) return a;
  const bare = p => ({at: p.at, n: p.n, head: ''}), lite = Object.assign({}, a, {pastes: a.pastes.map(bare), ai: a.ai.map(bare)});
  return bytes(JSON.stringify(lite)) <= room ? lite : null;
}

// ---- what the record says ----
const styleLabel = s => (hasOwn(VIVA_STYLE, s.style) ? VIVA_STYLE[s.style] : VIVA_STYLE.tutor).label;
function recordData(d) {
  const A = d.activity, days = A ? Object.keys(A.days).sort().map(k => Object.assign({day: k}, A.days[k])) : [];
  const sum = k => days.reduce((n, x) => n + (x[k] || 0), 0);
  const ins = {typed: sum('typed'), pasted: sum('pasted'), imported: A && A.imported ? A.imported.chars : 0, ai: sum('ai'), outline: sum('outline'), other: sum('other')};
  const total = Object.values(ins).reduce((a, b) => a + b, 0);
  const H = d.history ? d.history.list : [];
  const drafts = H.map((s, i) => { const c = i ? compareNotes(H[i - 1].notes, s.notes) : null; return {n: i + 1, at: s.at, words: s.words, kind: s.kind, notes: s.notes.length, fixed: c ? c.fixed.length : 0, added: c ? c.added.length : 0}; });
  const vivas = (d.defences || []).filter(s => s.done), answers = vivas.flatMap(s => s.qs.flatMap(q => q.turns)).filter(t => t.a);
  const pastedAns = t => t.pasted > t.a.length / 2;
  const cards = d.plan ? d.plan.cards.filter(c => !c.own) : [];
  const full = H.filter(s => s.kind !== 'recheck' && s.tier !== 'sample').length;
  const stamps = [...days.map(x => dayStart(x.day)), ...H.map(s => s.at), ...vivas.map(s => s.at)].filter(t => t > 0);
  if (!stamps.length) stamps.push(d.createdAt || Date.now(), d.updatedAt || Date.now());
  return {A, days, ins, total, ms: sum('ms'), asks: sum('asks'), acc: sum('acc'), deleted: sum('deleted'), active: days.filter(x => x.ms || x.typed || x.pasted || x.ai).length, drafts,
    fixed: drafts.reduce((n, x) => n + x.fixed, 0), reviews: full || (d.review && d.review.tier !== 'sample' ? 1 : 0), rechecks: H.filter(s => s.kind === 'recheck').length,
    mapped: !!(d.argmap && d.argmap.at > 0), cards: cards.length, kept: cards.filter(c => c.kept).length,
    vivas, spoken: answers.filter(t => t.spoken).length, pastedAns: answers.filter(pastedAns).length, typedAns: answers.filter(t => !t.spoken && !pastedAns(t)).length,
    from: dayKey(Math.min(...stamps)), to: dayKey(Math.max(...stamps))};
}
const dayStart = k => { const [y, m, dd] = k.split('-').map(Number); return new Date(y, m - 1, dd).getTime(); };
const srcName = (R, k, name) => k === 'imported' && R.A && R.A.imported && R.A.imported.sample ? 'From Throughline’s sample essay' : name;
const pct = (n, of) => of ? Math.round(n / of * 1000) / 10 : 0;
const dur = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'under a minute' : m < 60 ? plural(m, 'minute') : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
const fmtDay = k => { const [y, m, dd] = k.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'}); };
const fmtWhen = t => new Date(t).toLocaleString(undefined, {day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'});
const times = n => n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times';
const andList = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
// The honest account: what Claude did, and how much of the text came from Throughline rather than the writer.
function aiStatement(R) {
  const did = [R.reviews ? 'reviewed it ' + times(R.reviews) : '', R.rechecks ? 're-checked the changed paragraphs ' + times(R.rechecks) : '',
    R.asks ? 'answered ' + plural(R.asks, 'question') + ' about passages' : '', R.mapped ? 'mapped the argument' : '',
    R.cards ? 'suggested ' + plural(R.cards, 'brainstorm card') + (R.kept ? ' (' + R.kept + ' kept)' : '') : '',
    R.vivas.length ? 'examined the writer in ' + plural(R.vivas.length, 'viva') : ''].filter(Boolean);
  const nSug = R.acc || (R.A ? R.A.ai.length : 0), fromApp = R.ins.ai + R.ins.outline;
  const parts = [R.ins.ai ? (nSug ? plural(nSug, 'suggestion') : 'suggestions') + ' from ' + AI + ' the writer accepted (' + R.ins.ai.toLocaleString() + ' characters)' : '',
    R.ins.outline ? 'headings from the brainstorm outline (' + R.ins.outline.toLocaleString() + ' characters)' : ''].filter(Boolean);
  return {did: did.length ? AI + ' ' + andList(did) + '.' : AI + ' wasn’t used on this essay in Throughline.',
    text: fromApp ? 'Text that came from Throughline rather than the writer: ' + andList(parts) + ', ' + pct(fromApp, R.total) + '% of the text added here.'
      : R.total ? 'None of the text added here came from ' + AI + '.' : 'No text has been added in Throughline since the record started.',
    how: 'Throughline’s reviews mark problems in place and never rewrite the essay. Its text changes only when the writer accepts a suggestion.'};
}

// ---- the view ----
function openRecord() { closeMenus(); setMode('record'); }
function renderRecord() {
  if (st.mode !== 'record' || !st.cur) return;
  const d = st.cur, R = recordData(d), S = aiStatement(R), last = R.vivas[R.vivas.length - 1], lt = last ? tally(last) : null;
  const tile = (k, v, sub) => h('div', {class: 'rtile'}, h('span', {class: 'lbl'}, k), h('b', null, v), sub ? h('span', {class: 'sub'}, sub) : null);
  fill(recEl,
    h('div', {class: 'chead2'}, h('button', {class: 'btn sm ghost', type: 'button', onclick: () => setMode('write')}, '← Back to the essay'), h('h2', null, 'Writing record'),
      h('span', {class: 'racts'}, st.dl && !st.dlOff ? h('button', {class: 'btn sm primary', type: 'button', id: 'recDownload', onclick: downloadRecord}, 'Download') : null,
        h('button', {class: 'btn sm', type: 'button', id: 'recCopy', onclick: copyRecord}, 'Copy as text'))),
    h('p', {class: 'rsub'}, (d.title || 'Untitled essay') + ' · ' + plural(words(d.text), 'word') + ' · ' + fmtDay(R.from) + (R.to !== R.from ? ' – ' + fmtDay(R.to) : '')),
    R.A ? null : h('p', {class: 'rnote'}, 'This essay was started before Throughline kept writing records, so the record shows its drafts and vivas. Time and where the words came from are recorded from now on.'),
    h('div', {class: 'rtiles'},
      tile('Time writing', R.ms ? dur(R.ms) : '–', R.ms ? 'on ' + plural(R.active || 1, 'day') : 'recorded as you write'),
      tile('Typed by the writer', R.total ? pct(R.ins.typed, R.total) + '%' : '–', R.total ? 'of the text added here' : 'recorded as you write'),
      tile('Drafts reviewed', String(R.drafts.length), R.drafts.length > 1 ? plural(R.fixed, 'note') + ' fixed along the way' : 'review again after changes to compare'),
      tile('Viva', lt ? lt.strong + ' of ' + last.qs.length : '–', lt ? 'answers held up, ' + ago(last.at) : 'press Defend it after a review')),
    h('section', {class: 'rsec'}, h('h3', null, 'How it was written'), dayChart(R)),
    h('section', {class: 'rsec'}, h('h3', null, 'Where the words came from'), sourceBar(R),
      R.deleted ? h('p', {class: 'smeta'}, 'Also deleted along the way: ' + R.deleted.toLocaleString() + ' characters.') : null,
      R.A && R.A.pastes.length ? h('details', {class: 'rlist', id: 'recPastes'}, h('summary', null, plural(R.A.pastes.length, 'paste') + ' · ' + R.ins.pasted.toLocaleString() + ' characters'),
        h('ul', null, R.A.pastes.slice().reverse().map(p => h('li', null, h('span', {class: 'smeta'}, fmtWhen(p.at) + ' · ' + plural(p.n, 'character')), p.head ? h('span', null, '“' + p.head + '”') : null)))) : null,
      R.A && R.A.ai.length ? h('details', {class: 'rlist'}, h('summary', null, plural(R.A.ai.length, 'suggestion') + ' from ' + AI + ' you accepted'),
        h('ul', null, R.A.ai.slice().reverse().map(p => h('li', null, h('span', {class: 'smeta'}, fmtWhen(p.at) + ' · ' + plural(p.n, 'character')), p.head ? h('span', null, '“' + p.head + '”') : null)))) : null),
    R.drafts.length ? h('section', {class: 'rsec'}, h('h3', null, 'How it changed'),
      h('div', {class: 'rscroll'}, h('table', {class: 'rtable'}, h('thead', null, h('tr', null, [['Draft'], ['Date'], ['Words'], ['Notes', 'Notes the review found'], ['Fixed', 'Notes fixed since the draft before'], ['New', 'Notes that are new since the draft before']]
        .map(([x, tip], i) => h('th', {class: i > 1 ? 'num' : null, title: tip}, x)))),
        h('tbody', null, R.drafts.map(x => h('tr', null, h('td', null, x.n + (x.kind === 'recheck' ? ' (re-check)' : '')), h('td', null, fmtDay(dayKey(x.at))), h('td', {class: 'num'}, x.words.toLocaleString()),
          h('td', {class: 'num'}, x.notes), h('td', {class: 'num'}, x.n > 1 ? x.fixed : '–'), h('td', {class: 'num'}, x.n > 1 ? x.added : '–'))))))) : null,
    R.vivas.length ? h('section', {class: 'rsec'}, h('h3', null, 'Understanding'),
      h('ul', {class: 'rvivas'}, R.vivas.slice().reverse().map(s => { const n = tally(s); return h('li', null, dotsEl(s, -1), h('span', null, fmtDay(dayKey(s.at)) + ' · ' + styleLabel(s) + ' · ' + n.strong + ' of ' + s.qs.length + ' held up')); })),
      h('p', {class: 'smeta'}, 'Answers given out loud: ' + R.spoken + ' · typed: ' + R.typedAns + ' · mostly pasted: ' + R.pastedAns)) : null,
    h('section', {class: 'rsec rai'}, h('h3', null, 'How AI was used'), h('p', null, S.did), h('p', null, S.text), h('p', {class: 'smeta'}, S.how)),
    h('p', {class: 'fine'}, 'Kept by Throughline as the essay was written, in the writer’s own storage. It covers work done in Throughline' + (R.A ? ' since ' + fmtDay(dayKey(R.A.since || d.createdAt || Date.now())) : '') + ', not work done anywhere else.'));
}
// Every calendar day from the first to the last (the last `max` of them), so gaps show as gaps; the length carries over.
function calendar(days, max) {
  if (!days.length) return [];
  const by = new Map(days.map(x => [x.day, x])), last = dayStart(days[days.length - 1].day), cur = new Date(Math.max(dayStart(days[0].day), last - (max - 1) * 864e5 - 36e5));
  let w = 0; const out = [];
  for (const x of days) if (dayStart(x.day) < cur.getTime()) w = x.w;
  cur.setHours(0, 0, 0, 0);
  for (let guard = 0; cur.getTime() <= last && guard < max + 2; guard++) {
    const k = dayKey(cur), x = by.get(k);
    if (x) { w = x.w; out.push(x); }
    else out.push({day: k, ms: 0, typed: 0, pasted: 0, ai: 0, acc: 0, outline: 0, other: 0, deleted: 0, asks: 0, w, gap: true});
    cur.setDate(cur.getDate() + 1);
  }
  return out.slice(-max);
}
// Two small charts on one time axis (minutes, then length) rather than one chart with two scales.
function dayChart(R) {
  const days = calendar(R.days, 60), n = days.length;
  if (!n) return h('p', {class: 'khint'}, 'Nothing yet: time and words are recorded from now on, as you write.');
  if (n < 2) return h('p', {class: 'khint'}, 'All written on ' + fmtDay(days[0].day) + ' so far: ' + (days[0].ms ? dur(days[0].ms) : 'no time recorded') + ', ' + plural(days[0].w, 'word') + '. A day-by-day chart appears once you’ve written on two different days.');
  const cs = getComputedStyle(recEl), inner = recEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const W = Math.round(Math.max(260, Math.min(880, inner || 760))), PH = 76, TOP = 14, sw = W / n, cx = i => i * sw + sw / 2;
  const nice = (v, unit) => { const st0 = unit === 'm' ? [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480] : [100, 250, 500, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 30000, 50000];
    return st0.find(s => s >= v) || Math.ceil(v / 10000) * 10000; };
  const mins = days.map(x => Math.round(x.ms / 60000)), wds = days.map(x => x.w), mMax = nice(Math.max(1, ...mins), 'm'), wMax = nice(Math.max(1, ...wds), 'w');
  const y = (v, max) => TOP + PH - v / max * PH;
  const frame = (max, label) => [sv('line', {class: 'rgrid', x1: 0, x2: W, y1: TOP + .5, y2: TOP + .5}), sv('line', {class: 'raxisl', x1: 0, x2: W, y1: TOP + PH + .5, y2: TOP + PH + .5}),
    Object.assign(sv('text', {class: 'rtick', x: W, y: TOP - 4, 'text-anchor': 'end'}), {textContent: label(max)})];
  const cross = () => sv('line', {class: 'rcross', x1: 0, x2: 0, y1: TOP - 2, y2: TOP + PH, visibility: 'hidden'});
  // minutes: columns, capped at 24px, rounded at the data end and square on the baseline
  const s1 = sv('svg', {class: 'rchart', viewBox: '0 0 ' + W + ' ' + (TOP + PH + 1), 'aria-hidden': 'true'}), c1 = cross(), bars = [];
  s1.append(...frame(mMax, v => v + ' min'));
  mins.forEach((v, i) => {
    if (!v) { bars.push(null); return; }
    const bw = Math.max(2, Math.min(24, sw - 4)), x = cx(i) - bw / 2, top = y(v, mMax), base = TOP + PH, r = Math.min(4, bw / 2, base - top);
    const b = sv('path', {class: 'rbar', d: 'M' + x + ' ' + base + 'V' + (top + r) + 'Q' + x + ' ' + top + ' ' + (x + r) + ' ' + top + 'H' + (x + bw - r) + 'Q' + (x + bw) + ' ' + top + ' ' + (x + bw) + ' ' + (top + r) + 'V' + base + 'Z'});
    bars.push(b); s1.append(b);
  });
  s1.append(c1);
  // length: a 2px line with an end dot and its value at the end
  const s2 = sv('svg', {class: 'rchart', viewBox: '0 0 ' + W + ' ' + (TOP + PH + 1), 'aria-hidden': 'true'}), c2 = cross();
  s2.append(...frame(wMax, v => v.toLocaleString() + ' words'));
  const pts = wds.map((v, i) => [cx(i), y(v, wMax)]);
  if (n > 1) s2.append(sv('polyline', {class: 'rline', points: pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}));
  const [ex, ey] = pts[n - 1], dot = sv('circle', {class: 'rdot', cx: ex, cy: ey, r: 4});
  const endLbl = Object.assign(sv('text', {class: 'rend', x: ex - 9, y: ey < TOP + 22 ? ey + 16 : ey - 9, 'text-anchor': 'end'}), {textContent: wds[n - 1].toLocaleString()});
  s2.append(c2, dot, endLbl);
  // one readout for both charts: hover, tap or the arrow keys pick a day
  const read = h('p', {class: 'rread', 'aria-live': 'polite'});
  const show = (i, on) => {
    for (const c of [c1, c2]) { c.setAttribute('x1', cx(i)); c.setAttribute('x2', cx(i)); c.setAttribute('visibility', on ? 'visible' : 'hidden'); }
    s1.classList.toggle('hovering', on && !!bars[i]); bars.forEach((b, j) => b && b.classList.toggle('on', j === i));
    fill(read, h('b', null, mins[i] + ' min'), ' writing · ', h('b', null, wds[i].toLocaleString()), ' words · ', h('span', null, fmtDay(days[i].day)));
    fig.dataset.i = i;
  };
  const at = e => { const r = s1.getBoundingClientRect(); return Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / r.width * n))); };
  const fig = h('div', {class: 'rfig', tabindex: '0', role: 'group', 'aria-label': 'Writing day by day. Use the arrow keys to read each day.',
    onpointermove: e => show(at(e), true), onpointerdown: e => show(at(e), true), onpointerleave: () => show(n - 1, false),
    onkeydown: e => { const i = +fig.dataset.i, j = e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowRight' ? i + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
      if (j == null) return; e.preventDefault(); show(Math.max(0, Math.min(n - 1, j)), true); },
    onblur: () => show(n - 1, false)},
    h('div', {class: 'rct'}, 'Minutes writing'), s1, h('div', {class: 'rct'}, 'Words in the essay'), s2,
    h('div', {class: 'raxis'}, h('span', null, fmtDay(days[0].day)), n > 1 ? h('span', null, fmtDay(days[n - 1].day)) : null));
  show(n - 1, false);
  const table = h('details', {class: 'rlist'}, h('summary', null, 'Day by day'),
    h('div', {class: 'rscroll'}, h('table', {class: 'rtable'}, h('thead', null, h('tr', null, ['Date', 'Minutes', 'Words', 'Typed', 'Pasted', 'From ' + AI].map((x, i) => h('th', {class: i ? 'num' : null}, x)))),
      h('tbody', null, days.filter(x => !x.gap).reverse().map(x => h('tr', null, h('td', null, fmtDay(x.day)), h('td', {class: 'num'}, Math.round(x.ms / 60000)), h('td', {class: 'num'}, x.w.toLocaleString()),
        h('td', {class: 'num'}, x.typed.toLocaleString()), h('td', {class: 'num'}, x.pasted.toLocaleString()), h('td', {class: 'num'}, x.ai.toLocaleString())))))));
  return h('div', {class: 'rdays'}, fig, read, table);
}
// One whole split into its parts: a thin bar, with the legend carrying the names and numbers.
function sourceBar(R) {
  if (!R.total) return h('p', {class: 'khint'}, 'Nothing yet: where each word came from is recorded from now on, as you write.');
  const parts = SOURCES.filter(([k]) => R.ins[k] > 0).map(([k, name, c]) => [k, srcName(R, k, name), c]), say = ([k, name]) => name + ': ' + pct(R.ins[k], R.total) + '%, ' + R.ins[k].toLocaleString() + ' characters';
  return h('div', {class: 'rsrc'},
    h('div', {class: 'rbarh', role: 'img', 'aria-label': parts.map(say).join('; ')},
      parts.map(p => h('i', {title: say(p), style: 'flex-grow:' + R.ins[p[0]] + ';background:var(' + p[2] + ')'}))),
    h('ul', {class: 'rlegend'}, parts.map(([k, name, c]) => h('li', null, h('i', {style: 'background:var(' + c + ')'}), h('span', null, name), h('b', null, pct(R.ins[k], R.total) + '%'),
      h('span', {class: 'smeta'}, R.ins[k].toLocaleString() + ' characters')))));
}

// ---- taking it with you: a web page to download, or plain text ----
function recordText(d) {
  const R = recordData(d), S = aiStatement(R), lines = ['Writing record: ' + (d.title || 'Untitled essay'), plural(words(d.text), 'word') + ' · ' + fmtDay(R.from) + (R.to !== R.from ? ' – ' + fmtDay(R.to) : ''), ''];
  if (R.A) {
    lines.push('Time writing: ' + (R.ms ? dur(R.ms) + ' on ' + plural(R.active || 1, 'day') : 'none recorded'), 'Where the words came from:');
    for (const [k, name] of SOURCES) if (R.ins[k]) lines.push('  ' + srcName(R, k, name) + ': ' + pct(R.ins[k], R.total) + '% (' + R.ins[k].toLocaleString() + ' characters)');
    if (!R.total) lines.push('  nothing recorded yet');
    if (R.deleted) lines.push('  Deleted along the way: ' + R.deleted.toLocaleString() + ' characters');
  } else lines.push('Started before Throughline kept writing records: time and where the words came from aren’t included.');
  if (R.drafts.length) { lines.push('', 'Drafts:'); for (const x of R.drafts) lines.push('  Draft ' + x.n + (x.kind === 'recheck' ? ' (re-check)' : '') + ', ' + fmtDay(dayKey(x.at)) + ': ' + x.words + ' words, ' + plural(x.notes, 'note') + (x.n > 1 ? ', ' + x.fixed + ' fixed, ' + x.added + ' new' : '')); }
  if (R.vivas.length) { lines.push('', 'Vivas:'); for (const s of R.vivas) { const n = tally(s); lines.push('  ' + fmtDay(dayKey(s.at)) + ', ' + styleLabel(s).toLowerCase() + ': ' + n.strong + ' of ' + s.qs.length + ' answers held up'); } }
  lines.push('', 'How AI was used:', S.did, S.text, S.how, '', 'Kept by Throughline as the essay was written, in the writer’s own storage. It covers work done in Throughline only.');
  return lines.join('\n');
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
function recordHtml(d) {
  const R = recordData(d), S = aiStatement(R), title = esc(d.title || 'Untitled essay'), row = cells => '<tr>' + cells.map((c, i) => '<td' + (i ? ' class="n"' : '') + '>' + esc(c) + '</td>').join('') + '</tr>';
  const src = SOURCES.filter(([k]) => R.ins[k]).map(([k, name]) => '<li><b>' + pct(R.ins[k], R.total) + '%</b> ' + esc(srcName(R, k, name)) + ' <span>' + R.ins[k].toLocaleString() + ' characters</span></li>').join('');
  const days = R.days.slice().reverse().map(x => row([fmtDay(x.day), Math.round(x.ms / 60000), x.w.toLocaleString(), x.typed.toLocaleString(), x.pasted.toLocaleString(), x.ai.toLocaleString()])).join('');
  const drafts = R.drafts.map(x => row(['Draft ' + x.n + (x.kind === 'recheck' ? ' (re-check)' : '') + ', ' + fmtDay(dayKey(x.at)), x.words.toLocaleString(), x.notes, x.n > 1 ? x.fixed : '–', x.n > 1 ? x.added : '–'])).join('');
  const pastes = R.A ? R.A.pastes.map(p => '<li>' + esc(fmtWhen(p.at)) + ' · ' + p.n.toLocaleString() + ' characters' + (p.head ? ': “' + esc(p.head) + '”' : '') + '</li>').join('') : '';
  const vivas = R.vivas.map(s => { const n = tally(s); return '<li>' + esc(fmtDay(dayKey(s.at))) + ', ' + esc(styleLabel(s).toLowerCase()) + ': ' + n.strong + ' of ' + s.qs.length + ' answers held up</li>'; }).join('');
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Writing record: ' + title + '</title>' +
    '<style>:root{color-scheme:light}body{margin:0;background:#f6f5f1;color:#1c1b19;font:16px/1.55 Georgia,serif}main{max-width:760px;margin:0 auto;padding:40px 24px}h1{font-size:30px;line-height:1.2;margin:0 0 4px}' +
    'h2{font:600 13px/1.4 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#57544d;margin:30px 0 8px}p.sub{font:14px system-ui,sans-serif;color:#57544d;margin:0 0 18px}ul{padding-left:20px}li span{color:#57544d;font:13px system-ui,sans-serif}' +
    'table{border-collapse:collapse;width:100%;font:14px system-ui,sans-serif}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e3e0d8}th{color:#57544d;font-weight:600}.n{text-align:right;font-variant-numeric:tabular-nums}' +
    'footer{margin-top:34px;font:13px system-ui,sans-serif;color:#57544d}@media print{body{background:#fff}main{padding:0}}</style></head><body><main>' +
    '<h1>Writing record: ' + title + '</h1><p class="sub">' + plural(words(d.text), 'word') + ' · ' + esc(fmtDay(R.from)) + (R.to !== R.from ? ' – ' + esc(fmtDay(R.to)) : '') + ' · made ' + esc(new Date().toLocaleString()) + '</p>' +
    (R.A ? '<h2>Time</h2><p>' + (R.ms ? esc(dur(R.ms)) + ' writing, on ' + plural(R.active || 1, 'day') + '.' : 'None recorded yet.') + '</p>' +
      '<h2>Where the words came from</h2>' + (src ? '<ul>' + src + '</ul>' : '<p>Nothing recorded yet.</p>') + (R.deleted ? '<p>Also deleted along the way: ' + R.deleted.toLocaleString() + ' characters.</p>' : '') +
      (pastes ? '<h2>Pastes</h2><ul>' + pastes + '</ul>' : '') +
      (days ? '<h2>Day by day</h2><table><thead><tr><th>Date</th><th class="n">Minutes</th><th class="n">Words</th><th class="n">Typed</th><th class="n">Pasted</th><th class="n">From ' + esc(AI) + '</th></tr></thead><tbody>' + days + '</tbody></table>' : '')
      : '<p>This essay was started before Throughline kept writing records, so time and where the words came from aren’t included.</p>') +
    (drafts ? '<h2>Drafts</h2><table><thead><tr><th>Draft</th><th class="n">Words</th><th class="n">Notes found</th><th class="n">Fixed since the draft before</th><th class="n">New since then</th></tr></thead><tbody>' + drafts + '</tbody></table>' : '') +
    (vivas ? '<h2>Vivas</h2><ul>' + vivas + '</ul><p>Answers given out loud: ' + R.spoken + ' · typed: ' + R.typedAns + ' · mostly pasted: ' + R.pastedAns + '</p>' : '') +
    '<h2>How AI was used</h2><p>' + esc(S.did) + '</p><p>' + esc(S.text) + '</p><p>' + esc(S.how) + '</p>' +
    '<footer>Kept by Throughline as the essay was written, in the writer’s own storage. It covers work done in Throughline' + (R.A ? ' since ' + esc(fmtDay(dayKey(R.A.since || d.createdAt || Date.now()))) : '') + ', not work done anywhere else.</footer></main></body></html>';
}
async function downloadRecord() {
  if (!st.dl) return;
  const d = st.cur, name = (d.title || 'Essay').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Essay';
  try { const r = await st.dl.save({filename: name + ' - writing record.html', data: recordHtml(d)}); if (!r || r.status !== 'delivered') toast('Writing record saved.'); }
  catch (e) {
    const c = e && e.code;
    if (c === 'declined') return;
    if (c === 'rate_limited') { toast('A save is already waiting for your answer.'); return; }
    if (c === 'bad_request' || c === 'transform_error' || c === 'too_large') { toast('Couldn’t save the record. Copy it as text instead.'); return; }
    st.dlOff = true; renderRecord();
    toast(c === 'host_unavailable' ? 'This app can’t save files. Open Throughline in a browser to download the record, or copy it as text.'
      : c === 'extension_not_enabled' ? 'Saving web pages isn’t available here. Copy the record as text instead.' : 'Saving files isn’t available here. Copy the record as text instead.');
  }
}
async function copyRecord() {
  try { await navigator.clipboard.writeText(recordText(st.cur)); toast('Copied. Paste it wherever you hand in your work.'); }
  catch (e) { toast(st.dl && !st.dlOff ? 'Copying isn’t allowed here. Download the record instead.' : 'Copying isn’t allowed here.'); }
}
