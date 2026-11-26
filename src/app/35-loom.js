// ---- the loom: an essay's ideas as threads through its paragraphs ----
// Claude names the thesis and the main ideas and says where each appears: woven into a paragraph, running underneath
// it, or knotted against another idea. The app checks every quote against the paragraphs (validateLoom) and works out
// the loose ends and the ideas that first appear in the conclusion (loomFacts). A full-width view in Write mode.
const loomEl = $('#loom');
Object.assign(st, {loomRun: null, loomErr: null, loomSel: null, loomHi: null});
// The validated categorical slots in a fixed order with orange last, as it sits nearest the rust that marks problems. The thesis is ink.
const LOOM_C = ['--s1', '--s3', '--s4', '--s5', '--s2'];
const LOOM_SAY = {woven: 'woven in', under: 'runs underneath', knot: 'a knot'};
function loomColor(v, i) { return v.threads[i].thesis ? '--ink' : LOOM_C[(i - (v.threads[0] && v.threads[0].thesis ? 1 : 0)) % LOOM_C.length]; }
function openLoom() { closeMenus(); setMode('loom'); }
// The loom as it stands against the essay now: quotes that moved are followed, ones that went are dropped.
function loomNow(d) {
  if (!d.loom) return null;
  const paras = textParas(d.text), v = validateLoom(d.loom, paras, 5);
  return {v, paras, facts: loomFacts(v, paras.length, d.loom.keep), stale: d.loom.sig !== hash(d.text)};
}
// The thread to show first: a loose end, then a knot, then the thesis.
function loomFirst(v, facts) {
  const i = facts.findIndex(f => f.loose), k = facts.findIndex(f => f.knots);
  return i >= 0 ? i : k >= 0 ? k : 0;
}
function renderLoom() {
  if (st.mode !== 'loom' || !st.cur) return;
  const d = st.cur, busy = !!(st.loomRun && st.loomRun.doc === d), off = st.ai === 'denied' || st.ai === 'off', now = loomNow(d), N = textParas(d.text).length;
  const kids = [
    h('div', {class: 'chead2'}, h('button', {class: 'btn sm ghost', type: 'button', onclick: () => setMode('write')}, '← Back to the essay'), h('h2', null, 'The loom'),
      h('span', {class: 'racts'}, now && now.v.threads.length && !busy && !off ? h('button', {class: 'btn sm', type: 'button', id: 'loomAgain', onclick: runLoom}, 'Check again') : null)),
    h('p', {class: 'rsub'}, (d.title || 'Untitled essay') + ' · ' + plural(N, 'paragraph'))];
  if (busy) kids.push(h('section', {class: 'prog', 'aria-live': 'polite'}, h('div', {class: 'pbar'}, h('i')),
    h('div', {class: 'ptxt'}, h('b', null, 'Following each idea through your paragraphs…'), h('span', {id: 'loomTime'}, loomTime())),
    h('button', {class: 'btn sm', type: 'button', onclick: () => st.loomRun && st.loomRun.ctl.abort()}, 'Stop')));
  if (st.loomErr && st.loomErr.doc === d) kids.push(h('section', {class: 'errc', role: 'alert'}, h('b', null, 'The loom didn’t finish'), h('p', null, errText(st.loomErr.err)),
    isHard(st.loomErr.err) ? null : h('button', {class: 'btn sm', type: 'button', onclick: runLoom}, 'Try again')));
  if (!now || !now.v.threads.length) {
    kids.push(h('section', {class: 'lintro'},
      h('p', null, 'Each idea in your essay is a thread. The loom shows where each one is woven into a paragraph, where it runs underneath, where two ideas pull against each other, and where one is dropped.'),
      now ? h('p', {class: 'fine'}, 'None of the threads found before can be traced in the essay as it is now.') : null,
      N < 3 ? h('p', {class: 'fine'}, 'Write at least three paragraphs first.') : off ? h('p', {class: 'fine'}, st.aiWhy || 'AI isn’t available in this view.')
        : busy ? null : h('button', {class: 'btn primary', type: 'button', id: 'loomRun', onclick: runLoom}, now ? 'Find them again' : 'Find the threads')));
    fill(loomEl, kids); return;
  }
  const {v, facts} = now, sum = (k) => facts.reduce((n, f) => n + (k === 'knots' ? f.knots : f[k] ? 1 : 0), 0);
  const knots = sum('knots'), loose = sum('loose'), fresh = sum('fresh');
  if (st.loomSel == null || !v.threads[st.loomSel]) st.loomSel = loomFirst(v, facts);
  kids.push(
    now.stale ? h('p', {class: 'rnote'}, 'Your essay has changed since these threads were found. Places that moved are followed; ', h('button', {class: 'lnk', type: 'button', onclick: runLoom, disabled: busy || off}, 'check again'), ' for a fresh read.') : null,
    h('ul', {class: 'lsum', 'aria-label': 'What the loom found'}, h('li', null, plural(v.threads.length, 'thread')),
      h('li', {class: knots ? 'warn' : ''}, plural(knots, 'knot')), h('li', {class: loose ? 'warn' : ''}, plural(loose, 'loose end')),
      fresh ? h('li', {class: 'warn'}, plural(fresh, 'new idea') + ' in your conclusion') : null),
    h('div', {class: 'lgrid'}, h('section', {class: 'lmain', 'aria-label': 'Threads across paragraphs'}, loomTable(now), loomKey()), loomSide(d, now)));
  fill(loomEl, kids);
}
function loomTable(now) {
  const {v, paras, facts} = now, N = paras.length;
  const rows = v.threads.map((t, ti) => {
    const f = facts[ti], at = new Map(t.paras.map(e => [e.p - 1, e])), sel = st.loomSel === ti, cells = [];
    const name = i => (v.threads[i - 1] || {}).name;
    const after = f.loose && !t.paras.some(e => e.p - 1 > f.last), before = f.fresh && !t.paras.some(e => e.p - 1 < N - 1);
    for (let i = 0; i < N; i++) {
      if (after && i === f.last + 1) {
        cells.push(h('td', {colspan: N - i, class: 'lc lfray'}, h('span', null, f.first === f.last ? 'Promised in ¶' + (f.first + 1) + ', never developed' : 'Dropped after ¶' + (f.last + 1))));
        break;
      }
      if (before && i === 0 && N > 1) { cells.push(h('td', {colspan: N - 1, class: 'lc lnew'}, h('span', null, 'New in your conclusion'))); i = N - 2; continue; }
      const e = at.get(i);
      if (!e) { cells.push(h('td', {class: 'lc'}, h('span', {class: 'sr'}, '¶' + (i + 1) + ': not here'))); continue; }
      const tip = '¶' + (i + 1) + ': ' + LOOM_SAY[e.how] + (e.how === 'knot' && e.with && name(e.with) ? ' with “' + name(e.with) + '”' : '') + (e.note ? '. ' + e.note : '') + (e.quote ? ' “' + e.quote + '”' : '');
      cells.push(h('td', {class: 'lc l' + e.how[0] + (at.has(i - 1) ? '' : ' ls') + (at.has(i + 1) ? '' : ' le'), title: tip},
        h('i', {class: 'lb', 'aria-hidden': 'true'}), e.how === 'knot' ? h('i', {class: 'lk', 'aria-hidden': 'true'}) : null, h('span', {class: 'sr'}, tip)));
    }
    return h('tr', {class: sel ? 'on' : '', style: '--tc:var(' + loomColor(v, ti) + ')'},
      h('th', {scope: 'row', class: 'lname'}, h('button', {type: 'button', class: 'lthread', 'aria-pressed': String(sel), onclick: () => { st.loomSel = ti; renderLoom(); }},
        h('i', {'aria-hidden': 'true'}), h('span', null, t.name), t.thesis ? h('small', null, 'Your thesis') : null)), cells);
  });
  return h('div', {class: 'lwrap'}, h('table', {class: 'loomt', style: '--n:' + N},
    h('caption', {class: 'sr'}, 'Each idea across the paragraphs'),
    h('thead', null, h('tr', null, h('th', {scope: 'col', class: 'lname'}, 'Thread'),
      paras.map((p, i) => h('th', {scope: 'col', class: 'lp', title: gist(p, 18)}, h('b', null, '¶' + (i + 1)), h('span', null, gist(p, 3)))))),
    h('tbody', null, rows)));
}
function loomKey() {
  const item = (cls, label) => h('li', null, h('span', {class: 'lkey ' + cls, 'aria-hidden': 'true'}, h('i', {class: 'lb'}), cls === 'lk' ? h('i', {class: 'lk'}) : null), label);
  return h('ul', {class: 'lkeys', 'aria-label': 'Key'}, item('lw', 'Woven into the paragraph'), item('lu', 'Runs underneath'), item('lk', 'A knot: ideas pull against each other'),
    h('li', null, h('span', {class: 'lkey lf', 'aria-hidden': 'true'}), 'A loose end'));
}
function loomSide(d, now) {
  const {v, facts} = now, ti = st.loomSel, t = v.threads[ti], f = facts[ti], kept = (d.loom.keep || []).includes(t.name);
  const status = f.loose ? (f.first === f.last ? 'Promised in ¶' + (f.first + 1) + ', never developed' : 'Dropped after ¶' + (f.last + 1))
    : f.fresh ? 'New in your conclusion' : f.knots ? plural(f.knots, 'knot') : f.first < 0 ? 'Runs underneath' : f.first === f.last ? 'In ¶' + (f.first + 1) : 'Woven through ¶' + (f.first + 1) + '–¶' + (f.last + 1);
  const rel = v.links.filter(l => l.a === ti + 1 || l.b === ti + 1).map(l => ({other: v.threads[(l.a === ti + 1 ? l.b : l.a) - 1], how: l.how, note: l.note}));
  return h('section', {class: 'lside', style: '--tc:var(' + loomColor(v, ti) + ')', 'aria-label': 'The thread “' + t.name + '”'},
    h('p', {class: 'lkind'}, h('i', {'aria-hidden': 'true'}), t.thesis ? 'Your thesis' : 'Thread'),
    h('h3', null, t.name),
    h('p', {class: 'lstat' + (f.loose || f.fresh || f.knots ? ' warn' : '')}, status),
    t.note ? h('p', {class: 'lnote'}, t.note) : null,
    t.ask ? h('div', {class: 'lask'}, h('b', null, 'Ask yourself'), h('p', null, t.ask)) : null,
    h('div', null, h('b', {class: 'lsub'}, 'Where it appears'), h('ul', {class: 'lwhere'}, t.paras.map(e => h('li', null,
      h('button', {class: 'lnk', type: 'button', 'aria-label': 'Show ¶' + e.p + ' in the essay', onclick: () => loomShow(ti, e.p)}, '¶' + e.p), ' ' + LOOM_SAY[e.how] +
      (e.quote ? ': “' + trunc(e.quote, 90) + '”' : '') + (e.how === 'knot' && e.note ? '. ' + e.note : ''))))),
    rel.length ? h('div', null, h('b', {class: 'lsub'}, 'How it relates to the rest'), h('ul', {class: 'lrel'}, rel.map(x => h('li', null,
      h('span', {class: 'ltag ' + x.how}, x.how === 'supports' ? 'Supports' : 'In tension'), ' ' + x.other.name + (x.note ? ': ' + x.note : ''))))) : null,
    h('div', {class: 'acts'},
      t.paras.some(e => e.quote) ? h('button', {class: 'btn sm primary', type: 'button', id: 'loomShow', onclick: () => loomShow(ti)}, 'Show it in the essay') : null,
      f.loose ? h('button', {class: 'btn sm', type: 'button', id: 'loomKeep', onclick: () => loomKeep(t.name, true)}, 'I meant to drop it')
        : kept ? h('button', {class: 'btn sm ghost', type: 'button', onclick: () => loomKeep(t.name, false)}, 'Flag it again') : null));
}
function loomKeep(name, on) {
  const d = ensureReal(st.cur);
  d.loom.keep = on ? [...new Set([...(d.loom.keep || []), name])].slice(-20) : (d.loom.keep || []).filter(x => x !== name);
  d.updatedAt = Date.now(); persist(d);
  renderLoom();
  toast(on ? 'No longer flagged as a loose end.' : 'Flagged again.');
}
// Light up a thread's quotes in the essay (all of them, or one paragraph's), in the thread's colour.
function loomShow(ti, para) {
  const d = st.cur, now = loomNow(d); if (!now) return;
  const t = now.v.threads[ti], text = d.text, starts = paraStarts(text), out = [];
  for (const e of t.paras) {
    if (para && e.p !== para) continue;
    const i = e.p - 1, raw = text.slice(starts[i]).split('\n')[0], lead = raw.length - raw.trimStart().length, s0 = starts[i] + lead, p = raw.trim();
    const r = e.quote ? anchorFuzzy(p, e.quote) : null;
    out.push(r ? [s0 + r[0], s0 + r[1]] : [s0, s0 + p.length]);
  }
  if (!out.length) return;
  st.loomHi = {r: out, c: loomColor(now.v, ti)};
  setMode('write');
  backdrop.style.setProperty('--lhc', 'var(' + st.loomHi.c + ')');
  renderBackdrop();
  requestAnimationFrame(() => scrollToRange(out[0], 0.3));
  toast('Showing “' + trunc(t.name, 40) + '”. Type or press Esc to clear it.');
}
function loomClear() { if (st.loomHi) { st.loomHi = null; renderBackdrop(); } }
ed.addEventListener('input', loomClear);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && st.loomHi && st.mode === 'write') loomClear(); });

// ---- the AI call, only when the writer asks ----
function loomPrompt(d, paras) {
  const numbered = paras.map((x, i) => '[' + (i + 1) + '] ' + x).join('\n\n');
  return LOOM_RULES.replace('{n}', '5') + '\n\nESSAY TITLE: ' + docLabel(d) +
    '\n\nESSAY (each paragraph starts with its number in brackets; never include these numbers in a quote):\n<essay>\n' + fence(numbered) + '\n</essay>';
}
function loomTime() { const R = st.loomRun; if (!R) return ''; const s = Math.floor((Date.now() - R.t0) / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
async function runLoom() {
  const d = st.cur; if (st.loomRun || !d || d.role === 'source') return;
  const text = d.text, paras = textParas(text);
  if (paras.length < 3) { toast('Write at least three paragraphs first.'); return; }
  if (st.ai === 'pending') await capsReady;
  if (!sampleFn || st.ai !== 'ready') { toast(st.aiWhy || 'AI isn’t available in this view.'); return; }
  const prompt = loomPrompt(d, paras), tier = pickTier();
  st.loomErr = null;
  if (bytes(prompt) > LIMITS.promptBytes) { st.loomErr = {doc: d, err: {code: 'prompt_too_large'}}; renderLoom(); return; }
  const R = st.loomRun = {doc: d, ctl: new AbortController(), t0: Date.now()};
  renderLoom();
  const tick = setInterval(() => { const b = $('#loomTime'); if (b) b.textContent = loomTime(); }, 1000);
  try {
    const opts = {signal: R.ctl.signal}; if (tier) opts.modelTier = tier;
    const v = await askClaude('loom', d, prompt, opts, raw => { const x = validateLoom(raw, paras, 5); if (!x.threads.length) throw Object.assign(new Error('No threads could be traced in the essay.'), {code: 'bad_output'}); return x; });
    const e = ensureReal(d), keep = (d.loom && d.loom.keep) || [];
    e.loom = {sig: hash(text), at: Date.now(), threads: v.threads, links: v.links, keep};
    e.updatedAt = Date.now(); persist(e, 0);
    st.loomSel = loomFirst(v, loomFacts(v, paras.length, keep));
  } catch (err) {
    if (!(err && err.code === 'cancelled')) { st.loomErr = {doc: d, err}; noteAiError(err); }
  } finally {
    clearInterval(tick); st.loomRun = null;
    if (st.cur === d) renderLoom();
  }
}
