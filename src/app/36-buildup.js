// ---- Build-up: how the essay leads a reader to its point ----
// Claude says what each paragraph does (hook, stakes, claim, reasons, the other side, a reply, a close), how much a
// reader would want to read on after it, which questions are left open, and the changes that would help most. The
// app checks that (validateBuild) and works out each shape's steps itself (buildSteps), so switching shapes is free.
// A full-width view in Write mode, like the loom.
const buildEl = $('#build');
Object.assign(st, {buildRun: null, buildErr: null, buildPeek: -1, buildOrder: -1});
const BUILD_KIND = {missing: 'Missing step', order: 'Order', weak: 'Not doing its job yet'};
function openBuild() { closeMenus(); setMode('build'); }
// The reading as it stands against the essay now, and the shape being looked at.
function buildNow(d) {
  if (!d.build) return null;
  const paras = textParas(d.text), B = validateBuild(d.build, paras, 3);
  return {B, paras, shape: d.build.pick || B.shape, stale: d.build.sig !== hash(d.text)};
}
function renderBuild() {
  if (st.mode !== 'build' || !st.cur) return;
  const d = st.cur, busy = !!(st.buildRun && st.buildRun.doc === d), off = st.ai === 'denied' || st.ai === 'off', now = buildNow(d), N = textParas(d.text).length;
  const kids = [
    h('div', {class: 'chead2'}, h('button', {class: 'btn sm ghost', type: 'button', onclick: () => setMode('write')}, '← Back to the essay'), h('h2', null, 'Build-up'),
      h('span', {class: 'racts'}, now && !busy && !off ? h('button', {class: 'btn sm', type: 'button', id: 'buildAgain', onclick: runBuild}, 'Check again') : null)),
    h('p', {class: 'rsub'}, 'How “' + (d.title || 'Untitled essay') + '” leads a reader to its point')];
  if (busy) kids.push(h('section', {class: 'prog', 'aria-live': 'polite'}, h('div', {class: 'pbar'}, h('i')),
    h('div', {class: 'ptxt'}, h('b', null, 'Reading it the way a reader would…'), h('span', {id: 'buildTime'}, buildTime())),
    h('button', {class: 'btn sm', type: 'button', onclick: () => st.buildRun && st.buildRun.ctl.abort()}, 'Stop')));
  if (st.buildErr && st.buildErr.doc === d) kids.push(h('section', {class: 'errc', role: 'alert'}, h('b', null, 'The check didn’t finish'), h('p', null, errText(st.buildErr.err)),
    isHard(st.buildErr.err) ? null : h('button', {class: 'btn sm', type: 'button', onclick: runBuild}, 'Try again')));
  if (!now) {
    kids.push(h('section', {class: 'lintro'},
      h('p', null, 'A persuasive essay takes its reader through steps: why the question matters, your claim, your reasons, the other side and your reply. Build-up shows which steps your essay takes, where a reader’s interest rises and falls, and what to change first.'),
      N < 3 ? h('p', {class: 'fine'}, 'Write at least three paragraphs first.') : off ? h('p', {class: 'fine'}, st.aiWhy || 'AI isn’t available in this view.')
        : busy ? null : h('button', {class: 'btn primary', type: 'button', id: 'buildRun', onclick: runBuild}, 'Check the build-up')));
    fill(buildEl, kids); return;
  }
  const {B, shape} = now, steps = buildSteps(B, shape), fixNo = move => B.fixes.findIndex(f => f.move === move && f.kind !== 'order') + 1;
  const left = B.open.filter(o => !o.answered);
  kids.push(
    now.stale ? h('p', {class: 'rnote'}, 'Your essay has changed since this reading. ', h('button', {class: 'lnk', type: 'button', onclick: runBuild, disabled: busy || off}, 'Check again'), ' for a fresh one.') : null,
    h('div', {class: 'bshapes', role: 'group', 'aria-label': 'The shape of your essay'}, h('span', {class: 'fine'}, 'Shape'),
      Object.entries(BUILD_SHAPES).map(([k, S]) => h('button', {type: 'button', class: 'ulv', 'aria-pressed': String(k === shape), onclick: () => buildPick(k)},
        S.label, k === B.shape ? h('span', {class: 'bfit'}, ' · best fit') : null))),
    h('section', {class: 'bcard', 'aria-label': 'The steps a reader needs'},
      h('p', {class: 'ulab'}, 'The steps a reader needs, in order'),
      h('ol', {class: 'bsteps'}, steps.map((s, i) => h('li', {class: 'bstep ' + s.status},
        s.status === 'ok' ? h('span', {class: 'bok', 'aria-hidden': 'true'}, '✓') : s.status === 'missing' && fixNo(s.move) ? h('span', {class: 'bno', 'aria-hidden': 'true'}, fixNo(s.move)) : null,
        h('span', null, s.label + (s.status === 'missing' ? ': missing' : '')),
        s.paras.length ? h('span', {class: 'bp'}, s.paras.map(p => '¶' + p).join(' ')) : null,
        s.status === 'early' ? h('span', {class: 'bp'}, '· early') : s.status === 'weak' ? h('span', {class: 'bp'}, '· weak') : null,
        h('span', {class: 'sr'}, s.status === 'ok' ? ' (there)' : s.status === 'missing' ? '' : s.status === 'early' ? ' (comes too early)' : ' (doesn’t do its job yet)'))))),
    h('section', {class: 'bcard', 'aria-label': 'How much your reader wants to read on'},
      h('div', {class: 'bhead'}, h('h3', null, 'How much your reader wants to read on'),
        h('ul', {class: 'bkey', 'aria-label': 'Key'}, h('li', null, h('i', {class: 'kyou', 'aria-hidden': 'true'}), 'Your essay'), h('li', null, h('i', {class: 'kideal', 'aria-hidden': 'true'}), 'A strong ' + BUILD_SHAPES[shape].label.toLowerCase().replace(' → ', '-to-') + ' build-up'))),
      buildChart(B, shape),
      h('p', {class: 'fine'}, 'Claude’s estimate of a reader’s interest after each paragraph. Point at a paragraph for the reason.'),
      left.length ? h('div', {class: 'bopen'}, h('span', {class: 'fine'}, 'Still unanswered at the end'), left.map(o => h('span', {class: 'bqo'}, o.q + ' (raised in ¶' + o.raised + ')'))) : null),
    B.fixes.length ? h('section', {'aria-label': 'What would build it up best'}, h('h3', {class: 'bsec'}, 'What would build it up best'),
      h('div', {class: 'bfixes'}, B.fixes.map((f, i) => buildFix(d, now, f, i)))) : h('p', {class: 'rnote'}, 'Nothing to change first: each step is there, in a good order.'),
    h('p', {class: 'fine'}, 'Throughline points at the step and asks the question. You write the sentences.'));
  fill(buildEl, kids);
}
// The reader's pull, paragraph by paragraph, against a strong build-up of the same shape. The lines stretch with
// the box; points, labels and the hover layer are HTML, so text never stretches.
function buildChart(B, shape) {
  const N = B.paras.length, ideal = buildIdeal(shape, N), x = i => N > 1 ? 4 + 92 * i / (N - 1) : 50, y = v => 100 - v;
  const plot = sv('svg', {class: 'bplot', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true'});
  for (const v of [0, 50, 100]) plot.appendChild(sv('line', {x1: 0, x2: 100, y1: y(v), y2: y(v), class: 'bgrid' + (v ? '' : ' base'), 'vector-effect': 'non-scaling-stroke'}));
  plot.appendChild(sv('polyline', {points: ideal.map((v, i) => x(i) + ',' + y(v)).join(' '), class: 'bideal', 'vector-effect': 'non-scaling-stroke'}));
  let run = [];
  const flush = () => { if (run.length > 1) plot.appendChild(sv('polyline', {points: run.join(' '), class: 'byou', 'vector-effect': 'non-scaling-stroke'})); run = []; };
  B.paras.forEach((e, i) => { if (e.pull == null) flush(); else run.push(x(i) + ',' + y(e.pull)); });
  flush();
  const tip = h('div', {class: 'btip', role: 'status', hidden: true});
  const show = i => {
    const e = B.paras[i];
    st.buildPeek = i;
    tip.hidden = false; tip.style.left = x(i) + '%';
    fill(tip, h('b', null, '¶' + e.p), e.pull == null ? ' no reading' : ' · ' + e.pull + ' of 100', e.why ? h('span', null, e.why) : null, h('span', {class: 'fine'}, 'A strong build-up: ' + ideal[i]));
    for (const el of box.querySelectorAll('.bhit')) el.classList.toggle('on', +el.dataset.i === i);
  };
  const hide = () => { st.buildPeek = -1; tip.hidden = true; for (const el of box.querySelectorAll('.bhit')) el.classList.remove('on'); };
  const box = h('div', {class: 'bchart'},
    h('span', {class: 'by top'}, 'Hooked'), h('span', {class: 'by bot'}, 'Drifting'),
    h('div', {class: 'barea'}, plot,
      B.paras.map((e, i) => e.pull == null ? null : h('i', {class: 'bdot', style: 'left:' + x(i) + '%;top:' + y(e.pull) + '%'})),
      B.fixes.map((f, i) => { const e = B.paras[f.p - 1]; return e && e.pull != null ? h('span', {class: 'bnum', style: 'left:' + x(f.p - 1) + '%;top:' + y(e.pull) + '%', 'aria-hidden': 'true'}, i + 1) : null; }),
      B.paras.map((e, i) => h('button', {type: 'button', class: 'bhit', 'data-i': i, style: 'left:' + (N > 1 ? x(i) - 46 / (N - 1) : 0) + '%;width:' + (N > 1 ? 92 / (N - 1) : 100) + '%',
        'aria-label': '¶' + e.p + ': ' + (e.pull == null ? 'no reading' : e.pull + ' of 100') + (e.why ? ', ' + e.why : ''),
        onmouseenter: () => show(i), onfocus: () => show(i), onmouseleave: hide, onblur: hide, onclick: () => buildGo(e.p)})),
      tip),
    h('div', {class: 'bx', 'aria-hidden': 'true'}, B.paras.map((e, i) => h('span', {style: 'left:' + x(i) + '%'}, '¶' + e.p))));
  const table = h('div', {class: 'sr'}, h('table', null, h('caption', null, 'A reader’s interest after each paragraph, out of 100'),
    h('tr', null, h('th', null, 'Paragraph'), h('th', null, 'Your essay'), h('th', null, 'A strong build-up'), h('th', null, 'Why')),
    B.paras.map((e, i) => h('tr', null, h('td', null, '¶' + e.p), h('td', null, e.pull == null ? '–' : String(e.pull)), h('td', null, String(ideal[i])), h('td', null, e.why)))));
  return h('div', null, box, table);
}
function buildFix(d, now, f, i) {
  const open = st.buildOrder === i;
  return h('article', {class: 'bfix'},
    h('p', {class: 'bk'}, h('span', {class: 'bno', 'aria-hidden': 'true'}, i + 1), BUILD_KIND[f.kind] + ' · ¶' + f.p),
    h('h4', null, f.title),
    f.why ? h('p', {class: 'bwhy'}, f.why) : null,
    f.ask ? h('p', {class: 'bask'}, h('b', null, 'Ask yourself: '), f.ask) : null,
    open && f.order ? h('ol', {class: 'border', 'aria-label': 'Your paragraphs in this order'}, f.order.map(p => h('li', null, h('b', null, '¶' + p + ' '), trunc(now.paras[p - 1], 90)))) : null,
    h('div', {class: 'acts'},
      f.order ? (open
        ? [h('button', {class: 'btn sm primary', type: 'button', id: 'buildUse', onclick: () => buildReorder(f.order)}, 'Use this order'), h('button', {class: 'btn sm ghost', type: 'button', onclick: () => { st.buildOrder = -1; renderBuild(); }}, 'Keep mine')]
        : h('button', {class: 'btn sm', type: 'button', onclick: () => { st.buildOrder = i; renderBuild(); }}, 'Preview this order'))
        : h('button', {class: 'btn sm primary', type: 'button', onclick: () => buildGo(f.p)}, 'Go to ¶' + f.p)));
}
function buildPick(k) {
  const d = ensureReal(st.cur); if (!d.build) return;
  d.build.pick = k === d.build.shape ? null : k; d.updatedAt = Date.now(); persist(d);
  renderBuild();
}
// To a paragraph in the essay, with the caret at its start.
function buildGo(p) {
  const text = st.cur.text, s = paraStarts(text)[p - 1]; if (s == null) return;
  setMode('write');
  const at = s + (text.slice(s).match(/^\s*/) || [''])[0].length;
  requestAnimationFrame(() => { scrollToRange([at, at + 1], 0.25); if (!narrow.matches) { ed.focus({preventScroll: true}); ed.setSelectionRange(at, at); } });
}
// Put the paragraphs in the order shown: each paragraph moves whole, the breaks between them stay where they were.
function buildReorder(order) {
  const text = st.cur.text, starts = paraStarts(text), N = starts.length;
  if (order.length !== N) { toast('The essay has changed. Check again first.'); return; }
  const ends = starts.map(s => { const e = text.indexOf('\n', s); return e < 0 ? text.length : e; });
  let out = text.slice(0, starts[0]);
  order.forEach((p, i) => { out += text.slice(starts[p - 1], ends[p - 1]) + (i < N - 1 ? text.slice(ends[i], starts[i + 1]) : text.slice(ends[N - 1])); });
  st.buildOrder = -1;
  setMode('write');
  appEdit('other', '', () => replaceRange(0, ed.value.length, out, true));
  window.scrollTo(0, 0);
  toast('Paragraphs moved. ' + (mac ? '⌘Z' : 'Ctrl+Z') + ' puts them back.');
}

// ---- the AI call, only when the writer asks ----
function buildPrompt(d, paras) {
  const numbered = paras.map((x, i) => '[' + (i + 1) + '] ' + x).join('\n\n');
  return BUILD_RULES.replace('{n}', '3') + '\n\nESSAY TITLE: ' + docLabel(d) +
    '\n\nESSAY (each paragraph starts with its number in brackets; never include these numbers in a quote):\n<essay>\n' + fence(numbered) + '\n</essay>';
}
function buildTime() { const R = st.buildRun; if (!R) return ''; const s = Math.floor((Date.now() - R.t0) / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
async function runBuild() {
  const d = st.cur; if (st.buildRun || !d || d.role === 'source') return;
  const text = d.text, paras = textParas(text);
  if (paras.length < 3) { toast('Write at least three paragraphs first.'); return; }
  if (st.ai === 'pending') await capsReady;
  if (!sampleFn || st.ai !== 'ready') { toast(st.aiWhy || 'AI isn’t available in this view.'); return; }
  const prompt = buildPrompt(d, paras), tier = pickTier();
  st.buildErr = null; st.buildOrder = -1;
  if (bytes(prompt) > LIMITS.promptBytes) { st.buildErr = {doc: d, err: {code: 'prompt_too_large'}}; renderBuild(); return; }
  const R = st.buildRun = {doc: d, ctl: new AbortController(), t0: Date.now()};
  renderBuild();
  const tick = setInterval(() => { const b = $('#buildTime'); if (b) b.textContent = buildTime(); }, 1000);
  try {
    const opts = {signal: R.ctl.signal}; if (tier) opts.modelTier = tier;
    const B = await askClaude('build', d, prompt, opts, raw => { const x = validateBuild(raw, paras, 3); if (!x.paras.some(e => e.moves.length || e.pull != null)) throw Object.assign(new Error('Nothing came back that matches the essay.'), {code: 'bad_output'}); return x; });
    const e = ensureReal(d);
    e.build = Object.assign(B, {sig: hash(text), at: Date.now(), pick: null});
    e.updatedAt = Date.now(); persist(e, 0);
  } catch (err) {
    if (!(err && err.code === 'cancelled')) { st.buildErr = {doc: d, err}; noteAiError(err); }
  } finally {
    clearInterval(tick); st.buildRun = null;
    if (st.cur === d) renderBuild();
  }
}
