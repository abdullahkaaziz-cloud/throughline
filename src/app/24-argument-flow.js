// ---- argument flow: what each paragraph does for the thesis, drawn as one line ----
// Claude reads the essay once into a map (cached on the essay by text hash). The rail shows the map as a
// line through every paragraph that runs beside the text while the essay argues its thesis and drifts
// away from it where a paragraph strays, with arcs for paragraphs that back up or answer each other.
// The essay's margin draws the same line beside the paragraphs themselves.
const QUIET = ['heading', 'aside'];
const AM = {ax: 58, dr: 26};
const hashOf = (() => { let t = null, v = ''; return s => s === t ? v : (v = hash(t = s)); })();
const roleOf = r => hasOwn(ROLE_INFO, r) ? ROLE_INFO[r] : ROLE_INFO.context;
const normPs = v => (Array.isArray(v) ? v : v ? [v] : []).filter(n => Number.isInteger(n) && n > 0).slice(0, 6);

// 'fresh': mapped from this exact text; 'stale': edited since, same paragraphs; 'moved': paragraphs added or removed.
function argState(d) {
  const a = d && d.argmap;
  if (!a) return 'none';
  if (a.hash === hashOf(ed.value)) return 'fresh';
  return a.n && a.n === st.pstarts.length ? 'stale' : 'moved';
}
const argLinked = () => { const s = argState(st.cur); return s === 'fresh' || s === 'stale'; };
function paraRange(p) {
  const s = st.pstarts[p - 1]; if (s == null) return null;
  const e = ed.value.indexOf('\n', s);
  return [s, e < 0 ? ed.value.length : e];
}
function paraY(r) {
  const a = rangeRects(r[0], Math.min(r[1], r[0] + 1))[0], b = rangeRects(Math.max(r[0], r[1] - 1), r[1]).pop();
  return a && b ? [a.top, Math.max(a.bottom, b.bottom)] : null;
}

// ---- the AI call (only when the writer asks) ----
function argPrompt(d, text) {
  const numbered = text.split('\n').map(x => x.trim()).filter(Boolean).map((x, i) => '[' + (i + 1) + '] ' + x).join('\n\n');
  return ARG_RULES + '\n\nESSAY TITLE: ' + docLabel(d) +
    '\n\nESSAY TO MAP (each paragraph starts with its number in brackets):\n<essay>\n' + fence(numbered) + '\n</essay>';
}
async function runArgmap() {
  if (st.argRun) { toast('Already mapping an essay.'); return; }
  const d = st.cur, text = ed.value;
  if (words(text) < 40) { toast('Write or paste at least a paragraph first.'); return; }
  if (st.ai === 'pending') await capsReady;
  if (!sampleFn || st.ai !== 'ready') { toast(st.aiWhy || 'AI isn’t available in this view.'); return; }
  const prompt = argPrompt(d, text), tier = pickTier();
  st.argErr = null;
  if (bytes(prompt) > LIMITS.promptBytes) { st.argErr = {doc: d, err: {code: 'prompt_too_large'}}; renderRail(); return; }
  const R = st.argRun = {doc: d, ctl: new AbortController(), t0: Date.now(), done: 0, total: st.pstarts.length, tier: tier || 'default'};
  renderRail(); openSheet();
  const tick = setInterval(updateArgProgress, 1000);
  try {
    const opts = {signal: R.ctl.signal, onText: ({text: t}) => { if (st.argRun !== R) return; R.done = Math.min(R.total, (t.match(/"para"\s*:/g) || []).length); updateArgProgress(); }};
    if (tier) opts.modelTier = tier;
    const m = validateArgmap(await sampleFn.json(prompt, opts), text);
    if (!m.paras.length) throw {code: 'invalid_json'};
    d.argmap = Object.assign({at: Date.now(), hash: hash(text)}, m); d.updatedAt = Date.now();
    persist(d, 0);
    if (st.cur === d) { st.argSel = []; st.argHover = []; }
    toast('Mapped ' + plural(m.paras.length, 'paragraph') + (m.problems.length ? ' · ' + plural(m.problems.length, 'weak point') : ''));
  } catch (err) {
    if (!(err && err.code === 'cancelled')) { st.argErr = {doc: d, err}; noteAiError(err); }
  } finally {
    clearInterval(tick); st.argRun = null;
    st.lastSig = openSig(); renderRail(); scheduleLines();
  }
}
function argErrText(e) {
  const c = e && e.code;
  return c === 'prompt_too_large' ? 'This essay is too long to map in one go.' : c === 'refused' ? 'Claude declined to map this text.' : errText(e);
}

// ---- the rail: thesis, the line, and where it breaks ----
function renderArg() {
  const keep = rbody.scrollTop, d = st.cur, a = d.argmap, busy = st.argRun && st.argRun.doc === d, kids = [];
  if (busy) kids.push(argProgressEl());
  if (st.argErr && st.argErr.doc === d) kids.push(h('section', {class: 'errc', role: 'alert'}, h('b', null, 'The map didn’t finish'),
    h('p', null, argErrText(st.argErr.err)), isHard(st.argErr.err) ? null : h('button', {class: 'btn sm', onclick: runArgmap}, 'Try again')));
  if (a) kids.push(argMapEls(d, a));
  else if (!busy) kids.push(argEmptyEl());
  fill(rbody, kids);
  rbody.scrollTop = keep;
  drawArgMap();
}
function argProgressEl() {
  return h('section', {class: 'prog', 'aria-live': 'polite'}, h('div', {class: 'pbar'}, h('i')),
    h('div', {class: 'ptxt'}, h('b', {id: 'atitle'}, argProgTitle()), h('span', {id: 'atime'}, argProgSub())),
    h('button', {class: 'btn sm', onclick: () => { if (st.argRun) st.argRun.ctl.abort(); }}, 'Stop'));
}
function argProgTitle() { const R = st.argRun; return !R ? '' : R.done ? 'Mapping ¶' + R.done + ' of ' + R.total : 'Reading the argument…'; }
function argProgSub() {
  const R = st.argRun; if (!R) return '';
  const s = Math.floor((Date.now() - R.t0) / 1000);
  return (R.tier === 'complex' ? 'Thorough' : 'Faster') + ' · ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function updateArgProgress() { const a = $('#atitle'), b = $('#atime'); if (a) a.textContent = argProgTitle(); if (b) b.textContent = argProgSub(); }
function argSketch() {
  const s = sv('svg', {class: 'sketch', width: 44, height: 96, viewBox: '0 0 44 96', 'aria-hidden': 'true'});
  s.append(sv('path', {class: 'axis', d: 'M36 8V88'}), sv('path', {class: 'seg', d: 'M36 8C36 24 30 24 30 32C30 44 12 44 12 54C12 66 33 66 33 72C33 80 36 80 36 88'}));
  for (const [x, y, c] of [[36, 8, '--rel'], [30, 32, '--ink'], [12, 54, '--logic'], [33, 72, '--clar'], [36, 88, '--rel']]) s.append(sv('circle', {class: 'dot', cx: x, cy: y, r: 4.5, style: '--rc:var(' + c + ')'}));
  return s;
}
function argEmptyEl() {
  const off = st.ai === 'denied' || st.ai === 'off';
  return h('section', {class: 'empty aempty'}, argSketch(), h('div', null,
    h('h3', null, 'See how the argument develops'),
    h('p', null, 'Claude reads every paragraph and draws the essay as one line: what each paragraph does for your thesis, which paragraphs back each other up, and where the thread drifts or breaks.'),
    h('div', {class: 'acts'}, h('button', {class: 'btn sm primary', id: 'argRunBtn', onclick: runArgmap, disabled: off || !!st.argRun}, 'Map the argument')),
    h('p', {class: 'fine'}, off && st.aiWhy ? st.aiWhy : 'Uses your Claude plan, like a review. Your essay isn’t changed.')));
}
function argMapEls(d, a) {
  const state = argState(d), linked = state !== 'moved', busy = !!st.argRun, probs = new Map();
  a.problems.forEach((pr, i) => { for (const p of pr.paras) { if (!probs.has(p)) probs.set(p, []); probs.get(p).push(i); } });
  const tq = a.thesis.quote ? anchorExact(ed.value, a.thesis.quote) : null;
  return [
    h('section', {class: 'sum athesis'}, h('div', {class: 'srow'}, h('span', {class: 'lbl'}, 'Thesis'),
      a.thesis.text ? h('p', null, a.thesis.text) : null,
      tq && linked ? h('button', {class: 'lnk', onclick: () => goParas([para(tq[0])], tq)}, 'Stated in ¶' + para(tq[0])) : null,
      a.thesis.quote ? null : h('p', {class: 'warnp'}, a.thesis.text ? 'The essay never states this in one place. Say it in a sentence near the start.' : 'No clear thesis found. Say in one sentence what the essay argues.'))),
    state === 'fresh' ? null : h('div', {class: 'astale', role: 'status'},
      h('span', null, state === 'moved' ? 'Paragraphs were added or removed since this map, so it no longer lines up with the text.' : 'Edited since this map.'),
      h('button', {class: 'btn sm', onclick: runArgmap, disabled: busy}, 'Map again')),
    h('p', {class: 'akey'}, 'A dot drifts left when its paragraph strays from the thesis. Arcs join paragraphs that back up (solid) or answer (dashed) another.'),
    h('div', {class: 'amap' + (linked ? '' : ' off'), id: 'amap'}, sv('svg', {class: 'aline', 'aria-hidden': 'true'}),
      h('ol', {class: 'anodes', 'aria-label': 'The argument, paragraph by paragraph'}, a.paras.map(p => nodeEl(a, p, probs.get(p.para) || [], linked)))),
    a.problems.length ? h('section', {class: 'aprobs'}, h('span', {class: 'lbl'}, 'Where the thread breaks'),
      h('ol', null, a.problems.map(pr => probEl(pr, linked)))) : h('p', {class: 'clean'}, 'No breaks found: every paragraph connects to the thesis.'),
    h('p', {class: 'smeta'}, a.at ? 'Mapped by Claude · ' + ago(a.at) + ' · ' : 'Sample map · ', h('button', {class: 'lnk', onclick: runArgmap, disabled: busy}, 'Map again'))];
}
function nodeEl(a, p, probIdx, linked) {
  const R = roleOf(p.role), quiet = QUIET.includes(p.role), sel = st.argSel.includes(p.para);
  return h('li', {class: 'anode r-' + p.role + (quiet ? ' quiet' : '') + (sel ? ' on' : '') + (st.argHere === p.para ? ' here' : ''), data: {para: p.para}, style: '--rc:var(' + R.c + ')'},
    h('button', {class: 'abtn', type: 'button', 'aria-disabled': linked ? null : 'true', 'aria-pressed': String(sel),
      onclick: () => goParas([p.para]), onmouseenter: () => setArgHover(p.para), onmouseleave: () => setArgHover(0), onfocus: () => setArgHover(p.para), onblur: () => setArgHover(0)},
      h('span', {class: 'akind'}, h('span', null, R.label), h('span', {class: 'where'}, '¶' + p.para), probIdx.map(i => h('span', {class: 'abadge'}, PROBLEM_INFO[a.problems[i].kind]))),
      p.point ? h('span', {class: 'apoint'}, p.point) : null));
}
function probEl(pr, linked) {
  const ps = pr.paras.slice().sort((x, y) => x - y);
  return h('li', null, h('button', {class: 'aprob', type: 'button', 'aria-disabled': linked ? null : 'true',
    onclick: () => goParas(ps), onmouseenter: () => setArgHover(ps), onmouseleave: () => setArgHover(0), onfocus: () => setArgHover(ps), onblur: () => setArgHover(0)},
    h('span', {class: 'akind'}, h('span', null, PROBLEM_INFO[pr.kind]), h('span', {class: 'where'}, ps.map(n => '¶' + n).join(', '))),
    pr.note ? h('span', {class: 'apoint'}, pr.note) : null));
}
// Gap problems break the line between the paragraphs they name.
function isGap(a, p1, p2) { return a.problems.some(pr => pr.kind === 'gap' && pr.paras.length > 1 && Math.min(...pr.paras) <= p1 && p2 <= Math.max(...pr.paras)); }
const hasProblem = (a, p) => a.problems.some(pr => pr.paras.includes(p));
function drawArgMap() {
  const wrap = $('#amap'), a = st.cur && st.cur.argmap; if (!wrap || !a || st.view !== 'argument') return;
  const svg = wrap.querySelector('svg.aline'), byPara = new Map(a.paras.map(p => [p.para, p])), pos = new Map();
  svg.replaceChildren(); svg.setAttribute('width', AM.ax + AM.dr + 10); svg.setAttribute('height', wrap.offsetHeight);
  for (const li of wrap.querySelectorAll('.anode')) {
    const n = byPara.get(+li.dataset.para); if (!n || QUIET.includes(n.role)) continue;
    pos.set(n.para, {n, y: li.offsetTop + 16, x: AM.ax - (1 - n.thread) * AM.dr});
  }
  const main = [...pos.values()]; if (!main.length) return;
  svg.append(sv('path', {class: 'axis', d: `M${AM.ax} ${main[0].y}V${main[main.length - 1].y}`}));
  // Arcs bulge left of the dots they join: shortest first, each in the first lane where it overlaps nothing.
  // Backing up the thesis itself is what the line already shows, so those arcs are left out.
  const arcs = [], lanes = [];
  for (const q of main) for (const [kind, list] of [['sup', q.n.supports], ['ans', q.n.answers]]) for (const t of list) {
    const o = pos.get(t); if (o && !(kind === 'sup' && o.n.role === 'thesis')) arcs.push({kind, from: q, to: o, y1: Math.min(q.y, o.y), y2: Math.max(q.y, o.y)});
  }
  arcs.sort((x, y) => (x.y2 - x.y1) - (y.y2 - y.y1));
  for (const r of arcs.slice(0, 40)) {
    let L = 0;
    while (lanes[L] && lanes[L].some(([s, e]) => r.y1 < e && r.y2 > s)) L++;
    (lanes[L] = lanes[L] || []).push([r.y1, r.y2]);
    const xa = r.from.x - 6, xz = r.to.x - 6, xb = Math.min(xa, xz) - 8 - Math.min(L, 3) * 5, y1 = r.from.y, y2 = r.to.y;
    svg.append(sv('path', {class: 'arc ' + r.kind, d: `M${xa} ${y1}C${xb} ${y1} ${xb} ${y2} ${xz} ${y2}`}),
      sv('path', {class: 'arc hd ' + r.kind, d: `M${xz - 4} ${y2 - 3}L${xz} ${y2}L${xz - 4} ${y2 + 3}`}));
  }
  for (let i = 1; i < main.length; i++) {
    const s = main[i - 1], t = main[i], m = (s.y + t.y) / 2;
    svg.append(sv('path', {class: 'seg' + (isGap(a, s.n.para, t.n.para) ? ' gap' : ''), d: `M${s.x} ${s.y}C${s.x} ${m} ${t.x} ${m} ${t.x} ${t.y}`}));
  }
  for (const q of main) {
    const big = q.n.role === 'thesis' || q.n.role === 'conclusion';
    if (hasProblem(a, q.n.para)) svg.append(sv('circle', {class: 'pring', cx: q.x, cy: q.y, r: big ? 9.5 : 8.5}));
    svg.append(sv('circle', {class: 'dot', cx: q.x, cy: q.y, r: big ? 5.5 : 4.5, 'data-para': q.n.para, style: '--rc:var(' + roleOf(q.n.role).c + ')'}));
  }
  updateArgMarks();
}

// ---- the same line in the essay's margin, beside each paragraph ----
function drawThread() {
  const a = st.cur.argmap; if (!a || !argLinked()) return;
  const box = gut.getBoundingClientRect(), W = box.width; if (!W) return;
  const xOn = W - 8, span = Math.max(6, W - 20), segs = [];
  for (const n of a.paras) {
    if (QUIET.includes(n.role)) continue;
    const r = paraRange(n.para), y = r && paraY(r); if (!y) continue;
    segs.push({n, x: xOn - (1 - n.thread) * span, y1: y[0] - box.top + 6, y2: Math.max(y[0] - box.top + 6, y[1] - box.top - 6)});
  }
  segs.forEach((s, i) => {
    const t = segs[i + 1]; if (!t) return;
    const m = (s.y2 + t.y1) / 2;
    gut.append(sv('path', {class: 'tc' + (isGap(a, s.n.para, t.n.para) ? ' gap' : ''), d: `M${s.x} ${s.y2}C${s.x} ${m} ${t.x} ${m} ${t.x} ${t.y1}`}));
  });
  for (const s of segs) {
    const d = `M${s.x} ${s.y1}V${s.y2}`, g = sv('g', {class: 'th', 'data-para': s.n.para, style: '--rc:var(' + roleOf(s.n.role).c + ')'});
    g.append(sv('path', {class: 'tb', d}), sv('path', {class: 'hit', d}));
    if (hasProblem(a, s.n.para)) g.append(sv('circle', {class: 'tp', cx: s.x, cy: s.y1, r: 3.5}));
    g.addEventListener('mouseenter', () => setArgHover(s.n.para));
    g.addEventListener('mouseleave', () => setArgHover(0));
    g.addEventListener('click', () => { setArgSel([s.n.para]); const li = rbody.querySelector('.anode[data-para="' + s.n.para + '"]'); if (li) keepInRail(li); });
    gut.append(g);
  }
}

// ---- linking the map and the essay ----
function setArgHover(v) { const ps = normPs(v); if (ps.join() === st.argHover.join()) return; st.argHover = ps; updateArgMarks(); }
function setArgSel(v) { st.argSel = normPs(v); updateArgMarks(); }
function goParas(ps, range) {
  if (!argLinked()) { toast('Map again to line the map up with your essay.'); return; }
  const r = range || paraRange(ps[0]); if (!r) return;
  setArgSel(ps);
  if (narrow.matches) closeSheet();
  scrollToRange(r, 0.25);
}
function updateArgMarks() {
  const hov = new Set(st.argHover), sel = new Set(st.argSel);
  for (const el of rbody.querySelectorAll('.anode')) { const p = +el.dataset.para; el.classList.toggle('hov', hov.has(p)); el.classList.toggle('on', sel.has(p)); el.firstChild.setAttribute('aria-pressed', String(sel.has(p))); }
  for (const el of document.querySelectorAll('.aline .dot[data-para], #gutter g.th')) { const p = +el.getAttribute('data-para'); el.classList.toggle('hov', hov.has(p)); el.classList.toggle('on', sel.has(p)); }
  placeParaHi();
}
function placeParaHi() {
  const box = $('#parahi'), ps = st.argHover.length ? st.argHover : st.argSel, a = st.cur && st.cur.argmap;
  if (st.view !== 'argument' || !ps.length || !a || !argLinked()) { box.replaceChildren(); return; }
  const top = box.getBoundingClientRect().top, kids = [];
  for (const p of ps) {
    const r = paraRange(p), y = r && paraY(r); if (!y) continue;
    const n = a.paras.find(x => x.para === p);
    kids.push(h('i', {style: 'top:' + Math.round(y[0] - top - 5) + 'px;height:' + Math.round(y[1] - y[0] + 10) + 'px;--rc:var(' + roleOf(n ? n.role : 'context').c + ')'}));
  }
  box.replaceChildren(...kids);
}
function keepInRail(el) {
  const rb = rbody.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (r.top < rb.top + 8) rbody.scrollTop += r.top - rb.top - 8;
  else if (r.bottom > rb.bottom - 8) rbody.scrollTop += r.bottom - rb.bottom + 8;
}
// While reading a long essay, the map marks the paragraph you're on.
function spyHere() {
  if (st.view !== 'argument' || !st.cur.argmap) return;
  let here = 0;
  if (argLinked() && ed.offsetHeight > innerHeight * 1.5) {
    const y = innerHeight * 0.3, ps = st.pstarts; let lo = 0, hi = ps.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1, r = rangeRects(ps[mid], ps[mid] + 1)[0]; if (r && r.top <= y) { here = mid + 1; lo = mid + 1; } else hi = mid - 1; }
  }
  if (here === st.argHere) return;
  st.argHere = here;
  let cur = null;
  for (const el of rbody.querySelectorAll('.anode')) { const on = +el.dataset.para === here; el.classList.toggle('here', on); if (on) cur = el; }
  if (cur && !narrow.matches && !rail.matches(':hover')) keepInRail(cur);
}
function setView(v) {
  if (v !== 'notes' && v !== 'argument') return;
  const changed = st.view !== v;
  st.view = v; st.argHover = []; st.argSel = []; st.argHere = 0;
  for (const t of document.querySelectorAll('.rtab')) { const on = t.dataset.view === v; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; }
  rbody.setAttribute('aria-labelledby', v === 'argument' ? 'tabArg' : 'tabNotes');
  if (!changed) return;
  if (v === 'argument' && st.active) { st.active = null; applyStates(); }
  st.lastSig = openSig(); renderRail(); rbody.scrollTop = 0; scheduleLines(); placeParaHi();
  if (v === 'argument') requestAnimationFrame(spyHere);
}
for (const t of document.querySelectorAll('.rtab')) {
  t.addEventListener('click', () => { setView(t.dataset.view); openSheet(); });
  t.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const tabs = [...document.querySelectorAll('.rtab')], i = tabs.indexOf(t);
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[j].focus(); setView(tabs[j].dataset.view);
  });
}
let spyRAF = 0;
addEventListener('scroll', () => { if (st.view === 'argument' && !spyRAF) spyRAF = requestAnimationFrame(() => { spyRAF = 0; spyHere(); }); }, {passive: true});
