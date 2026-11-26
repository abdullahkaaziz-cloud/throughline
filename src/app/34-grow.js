// ---- Grow and Unfold: thinking an idea through, in Plan mode beside the brainstorm board ----
// Grow asks one question at a time about the writer's own idea: why, what they mean, who disagrees and how they'd
// answer, what follows, how it connects. Each answer becomes a branch, and the next question goes where the thinking is
// thinnest (growNext). Unfold shows the same answers at five levels of detail, from one line to the draft, with the
// gaps as questions. Every word is the writer's: Claude only phrases the questions, and plain ones stand in without it.
Object.assign(st, {planView: 'board', growSel: null, growRun: null, growDraft: '', growUndo: null, unfoldLevel: 3});
function growOf(d) {
  if (!d.grow) d.grow = {root: '', line: '', nodes: [], park: [], ask: null, order: [], at: 0};
  return d.grow;
}
function saveGrow() { const d = ensureReal(st.cur); growOf(d).at = Date.now(); d.updatedAt = Date.now(); persist(d); }
const growKidsOf = (G, id) => G.nodes.filter(n => n.p === id);
const growText = (G, id) => id ? (G.nodes.find(n => n.id === id) || {}).a || '' : G.root;
function planTabs(active) {
  return h('nav', {class: 'ptabs', 'aria-label': 'Ways to plan'}, [['board', 'Board'], ['grow', 'Grow'], ['unfold', 'Unfold']].map(([v, l]) =>
    h('button', {type: 'button', class: 'ptab', 'aria-pressed': String(v === active), onclick: () => { if (st.planView === v) return; st.planView = v; renderBoard(); window.scrollTo(0, 0); }}, l)));
}

// ---- Grow ----
function renderGrow() {
  if (st.mode !== 'plan' || !st.cur) return;
  const d = st.cur, G = growOf(d), focus = focusKey(), started = !!G.root.trim() && (G.nodes.length || G.ask || st.growRun);
  fill(boardEl,
    h('div', {class: 'phead'}, planTabs('grow'),
      h('p', {class: 'fine'}, st.growUndo && st.growUndo.doc === d ? [plural(st.growUndo.n, 'answer') + ' removed. ', h('button', {class: 'lnk', type: 'button', onclick: growUndoIt}, 'Undo')]
        : G.nodes.length ? plural(G.nodes.length, 'answer') + ' so far. Every word here is yours.' : 'Claude only asks. Every word here is yours.')),
    h('div', {class: 'ggrid' + (started ? '' : ' gstart')},
      h('div', {class: 'ghead'},
        h('label', {class: 'lbl', for: 'groot'}, 'Your starting thought'),
        h('textarea', {id: 'groot', class: 'groot', rows: 1, placeholder: 'What do you want to argue or explore?',
          oninput: e => { G.root = clip(e.target.value, 600); fitArea(e.target); saveGrow(); }}, G.root || planOf(d).q || defaultQuestion(d)),
        started ? growLegend() : h('div', {class: 'acts'}, h('button', {class: 'btn primary', type: 'button', id: 'growStart', onclick: growStart}, 'Ask me the first question'),
          h('p', {class: 'fine'}, 'Throughline asks one question at a time: why, what you mean, who disagrees, what follows. Your answers grow into a map of your idea.'))),
      started ? h('section', {class: 'gmain', 'aria-label': 'Your idea, as it grows'}, h('div', {class: 'gtreewrap'}, growTree(G)),
        h('p', {class: 'fine'}, 'Each branch is one of your answers. Choose one to see it in full, change it, or be asked about it.')) : null,
      started ? h('section', {class: 'gside', 'aria-label': 'The next question'}, st.growSel != null ? growSelEl(G) : null, growAskEl(d, G), growMeter(G),
        h('button', {class: 'btn gnext', type: 'button', onclick: () => { st.planView = 'unfold'; renderBoard(); window.scrollTo(0, 0); }}, 'Shape it into an outline', h('span', {'aria-hidden': 'true'}, ' →'))) : null));
  for (const t of boardEl.querySelectorAll('#groot, #growAns, #growEdit')) fitArea(t);
  restoreFocus(focus);
}
function growLegend() {
  return h('ul', {class: 'glegend', 'aria-label': 'Kinds of question'}, GROW_MOVES.map(k => h('li', {style: '--kc:var(' + GROW_INFO[k].c + ')'}, h('i', {'aria-hidden': 'true'}), GROW_INFO[k].label)));
}
// The idea as a tree: the starting thought, then each answer under the one it was asked about. The question on
// screen and any parked questions sit where they'd go, dashed.
function growTree(G) {
  const branch = id => {
    const items = growKidsOf(G, id).map(n => h('li', {class: 'gli', style: '--kc:var(' + GROW_INFO[n.k].c + ')'}, growNodeEl(n), branch(n.id)));
    if (G.ask && G.ask.p === id) items.push(h('li', {class: 'gli gwait', style: '--kc:var(' + GROW_INFO[G.ask.k].c + ')'},
      h('div', {class: 'gnode gopen'}, h('span', {class: 'gk'}, GROW_INFO[G.ask.k].label), h('span', {class: 'gw'}, 'Waiting for your answer'))));
    for (const q of G.park.filter(x => x.p === id)) items.push(h('li', {class: 'gli gparked'},
      h('button', {type: 'button', class: 'gnode gpark', title: 'Ask this one now', onclick: () => growUnpark(q.id)}, h('span', {class: 'gk'}, 'Parked'), h('span', {class: 'gw'}, q.q))));
    return items.length ? h('ul', null, items) : null;
  };
  const on = st.growSel === '';
  return h('ul', {class: 'gtree'}, h('li', {class: 'gli groot0'},
    h('button', {type: 'button', class: 'gnode gstem' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => { st.growSel = on ? null : ''; renderGrow(); }},
      h('span', {class: 'gk'}, 'Your idea'), h('span', {class: 'ga'}, G.root)), branch('')));
}
function growNodeEl(n) {
  const I = GROW_INFO[n.k], on = st.growSel === n.id;
  return h('button', {type: 'button', class: 'gnode' + (on ? ' on' : ''), 'aria-pressed': String(on), title: n.q ? 'Asked: ' + n.q : null,
    onclick: () => { st.growSel = on ? null : n.id; renderGrow(); }}, h('span', {class: 'gk'}, I.label), h('span', {class: 'ga'}, n.a));
}
// The answer the writer chose: in full, to change, to remove, or to be asked about.
function growSelEl(G) {
  const id = st.growSel, n = id ? G.nodes.find(x => x.id === id) : null;
  if (id && !n) { st.growSel = null; return null; }
  const below = id ? (() => { const gone = new Set([id]); let more = true; while (more) { more = false; for (const x of G.nodes) if (!gone.has(x.id) && gone.has(x.p)) { gone.add(x.id); more = true; } } return gone.size - 1; })() : 0;
  return h('section', {class: 'gsel', style: '--kc:var(' + (n ? GROW_INFO[n.k].c : '--ink') + ')'},
    h('p', {class: 'gkind'}, h('i', {'aria-hidden': 'true'}), n ? GROW_INFO[n.k].label : 'Your starting thought'),
    n && n.q ? h('p', {class: 'gabout'}, 'Asked: ' + n.q) : null,
    n ? h('textarea', {id: 'growEdit', class: 'gans', rows: 2, 'aria-label': 'Your answer',
      oninput: e => { const v = clip(e.target.value, 1200); if (v.trim()) { n.a = v; saveGrow(); } fitArea(e.target); }}, n.a) : null,
    h('div', {class: 'gacts'},
      h('button', {class: 'btn sm primary', type: 'button', onclick: () => growAbout(id), disabled: !!st.growRun}, 'Ask me about this'),
      n ? h('button', {class: 'btn sm ghost', type: 'button', onclick: () => growRemove(id)}, below ? 'Remove, with ' + plural(below, 'answer') + ' under it' : 'Remove') : null,
      h('button', {class: 'btn sm ghost', type: 'button', onclick: () => { st.growSel = null; renderGrow(); }}, 'Done')));
}
// The question on screen, with a box for the answer.
function growAskEl(d, G) {
  const a = G.ask, wait = !!(st.growRun && st.growRun.doc === d), ai = st.ai === 'ready' && sampleFn;
  if (!a && !wait) {
    const nx = growNext(G, null);
    return h('section', {class: 'gask'},
      h('p', {class: 'gq gquiet'}, nx ? 'Ready for the next question?' : 'No question left for now. Choose one of your answers to be asked about it, or bring back a parked one.'),
      nx ? h('div', {class: 'gacts'}, h('button', {class: 'btn primary', type: 'button', id: 'growNextBtn', onclick: () => growAsk(nx.p, nx.k)}, 'Next question')) : null);
  }
  const I = GROW_INFO[(a || {}).k] || GROW_INFO.why, n = G.nodes.length + 1;
  return h('section', {class: 'gask', style: '--kc:var(' + I.c + ')', 'aria-busy': String(wait)},
    h('p', {class: 'gkind'}, h('i', {'aria-hidden': 'true'}), I.label + ' · question ' + n),
    a ? h('p', {class: 'gabout'}, a.p ? 'About your answer: “' + trunc(growText(G, a.p), 90) + '”' : 'About your starting thought') : null,
    wait || !a || a.src === 'wait' ? h('p', {class: 'gq gquiet', 'aria-live': 'polite'}, h('span', {class: 'spin'}), ' Thinking of a question…')
      : h('h2', {class: 'gq', id: 'growQ'}, a.q),
    a && a.why && a.src !== 'wait' ? h('p', {class: 'gwhy'}, 'Why this question: ' + a.why) : null,
    a && a.err ? h('p', {class: 'fine'}, 'Claude couldn’t phrase this one, so here’s a plain question.') : null,
    h('label', {class: 'lbl', for: 'growAns'}, 'Your answer'),
    h('textarea', {id: 'growAns', class: 'gans', rows: 4, placeholder: 'In your own words. A rough answer is fine.', 'aria-describedby': a && a.src !== 'wait' ? 'growQ' : null,
      oninput: e => { st.growDraft = e.target.value.slice(0, 1200); fitArea(e.target); },
      onkeydown: e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); growAdd(); } }}, st.growDraft),
    h('p', {class: 'gpartial', id: 'growPartial', 'aria-live': 'polite'}),
    h('div', {class: 'gacts'},
      h('button', {class: 'btn primary', type: 'button', id: 'growAdd', onclick: growAdd, disabled: wait || null}, 'Add to my idea'),
      wait ? h('button', {class: 'btn ghost', type: 'button', onclick: () => st.growRun && st.growRun.ctl.abort()}, 'Stop')
        : [ai ? h('button', {class: 'btn', type: 'button', id: 'growAgain', onclick: growAgain}, 'Ask it another way') : null,
          h('button', {class: 'btn ghost', type: 'button', id: 'growSkip', onclick: growSkip, title: 'Park it for later'}, 'Skip')],
      st.dict && !st.dictBlocked ? h('button', {type: 'button', class: 'btn sm mic', id: 'growMic', 'aria-pressed': String(!!st.dictOn), onclick: toggleDictation},
        h('span', {class: 'micdot', 'aria-hidden': 'true'}), h('span', null, st.dictOn ? 'Stop listening' : 'Answer out loud')) : null));
}
// How far the idea has been thought through: answers of each kind, the missing kinds stand out.
function growMeter(G) {
  const c = growCounts(G), max = Math.max(1, ...GROW_MOVES.map(k => c[k])), waiting = G.nodes.filter(n => n.k === 'against' && !growKidsOf(G, n.id).some(x => x.k === 'reply')).length;
  return h('section', {class: 'gmeter', 'aria-label': 'How far you’ve thought it through'},
    h('h3', null, 'How far you’ve thought it through'),
    h('ul', null, GROW_MOVES.map(k => h('li', {class: c[k] ? '' : 'zero', style: '--kc:var(' + GROW_INFO[k].c + ')'},
      h('span', {class: 'gml'}, GROW_INFO[k].label, k === 'against' && waiting ? h('small', null, ' · ' + waiting + ' waiting for your reply') : null),
      h('span', {class: 'gmb', 'aria-hidden': 'true'}, h('i', {style: 'width:' + Math.round(100 * c[k] / max) + '%'})),
      h('span', {class: 'gmn'}, c[k])))),
    h('p', {class: 'fine'}, 'The next question goes where your thinking is thinnest.'));
}

// ---- asking ----
function growTemplate(G, p, k) {
  const I = GROW_INFO[k], reasons = growKidsOf(G, '').filter(n => n.k === 'why').length;
  return {q: k === 'why' ? (p ? I.ask.node : I.ask.root) : I.ask,
    why: k === 'why' ? (p ? GROW_WHY.why.node : reasons ? GROW_WHY.why.more : GROW_WHY.why.root) : GROW_WHY[k]};
}
function growPrompt(d, G, p, k, prev) {
  const one = s => String(s || '').replace(/\s+/g, ' ').trim(), num = new Map(), lines = ['Starting thought: ' + one(G.root)];
  const walk = (id, pre, depth) => growKidsOf(G, id).forEach((n, i) => {
    const no = pre + (i + 1); num.set(n.id, no);
    lines.push('  '.repeat(depth) + no + '. [' + GROW_INFO[n.k].label + '] ' + one(n.a));
    walk(n.id, no + '.', depth + 1);
  });
  walk('', '', 0);
  const asked = [...G.nodes.map(n => n.q), ...G.park.map(q => q.q), prev].filter(Boolean).slice(-15);
  const brief = d.brief && d.brief.text.trim() ? '\n\nBRIEF (the assignment, for context only):\n<brief>\n' + fence(clip(d.brief.text, 3000)) + '\n</brief>' : '';
  return GROW_RULES + '\n\nMOVE: ' + GROW_INFO[k].move + '\n\nFOCUS: ' + (p ? 'item ' + num.get(p) : 'the starting thought') +
    '\n\nIDEA (the writer’s starting thought and their answers so far, each under the item it answers):\n<idea>\n' + fence(lines.join('\n')) + '\n</idea>' +
    (asked.length ? '\n\nASKED (ask something different):\n<idea>\n' + fence(asked.map(q => '- ' + one(q)).join('\n')) + '\n</idea>' : '') + brief;
}
// Put a question on screen: phrased by Claude when it's available, a plain one otherwise or if that fails.
async function growAsk(p, k, again) {
  const d = st.cur, G = growOf(d), tpl = growTemplate(G, p, k), prev = again && G.ask ? G.ask.q : '';
  if (st.growRun) st.growRun.ctl.abort();
  G.ask = {p, k, q: '', why: tpl.why, src: 'wait'};
  if (st.ai === 'pending') { renderGrow(); await capsReady; }
  if (!sampleFn || st.ai !== 'ready') { G.ask = {p, k, q: tpl.q, why: tpl.why, src: 'tpl'}; saveGrow(); renderGrow(); return; }
  const R = st.growRun = {doc: d, ctl: new AbortController()};
  renderGrow();
  try {
    const opts = {signal: R.ctl.signal}, tier = pickTier(); if (tier) opts.modelTier = tier;
    const v = await askClaude('grow', d, growPrompt(d, G, p, k, prev), opts, raw => { const q = validateGrowQ(raw); if (!q) throw Object.assign(new Error('No question came back.'), {code: 'bad_output'}); return q; });
    if (st.growRun === R) G.ask = {p, k, q: v.question, why: v.why || tpl.why, src: 'ai'};
  } catch (err) {
    if (st.growRun === R) G.ask = {p, k, q: tpl.q, why: tpl.why, src: 'tpl', err: !(err && err.code === 'cancelled')};
    if (!(err && err.code === 'cancelled')) noteAiError(err);
  } finally {
    if (st.growRun === R) { st.growRun = null; saveGrow(); }
    if (st.cur === d && st.mode === 'plan' && st.planView === 'grow') { renderGrow(); const b = $('#growAns'); if (b && !st.growRun && document.activeElement === document.body) b.focus({preventScroll: true}); }
  }
}
function growStart() {
  const d = st.cur, G = growOf(d), box = $('#groot'), root = clip(box ? box.value : G.root, 600).trim();
  if (!root) { toast('Write your starting thought first.'); if (box) box.focus(); return; }
  G.root = root; saveGrow();
  const nx = growNext(G, null) || {p: '', k: 'why'};
  growAsk(nx.p, nx.k);
}
function growAdd() {
  const d = st.cur, G = growOf(d), box = $('#growAns'), a = clip(box ? box.value : st.growDraft, 1200).trim();
  if (!G.ask || G.ask.src === 'wait' || st.growRun) return;
  if (!a) { toast('Write your answer first. A rough one is fine.'); if (box) box.focus(); return; }
  stopDictation();
  G.nodes.push({id: newId(), p: G.ask.p, k: G.ask.k, q: G.ask.q, a, at: Date.now()});
  G.ask = null; st.growDraft = ''; st.growSel = null; st.growUndo = null;
  saveGrow();
  const nx = growNext(G, null);
  if (nx) growAsk(nx.p, nx.k); else renderGrow();
}
function growSkip() {
  const G = growOf(st.cur), a = G.ask;
  if (!a || a.src === 'wait' || st.growRun) return;
  G.park = G.park.filter(q => !(q.p === a.p && q.k === a.k)).concat({id: newId(), p: a.p, k: a.k, q: a.q, at: Date.now()}).slice(-40);
  G.ask = null; saveGrow();
  const nx = growNext(G, null, a.k);
  if (nx) growAsk(nx.p, nx.k); else { renderGrow(); toast('Parked. Choose one of your answers to be asked about it.'); }
}
function growAgain() { const G = growOf(st.cur); if (G.ask && G.ask.src !== 'wait' && !st.growRun) growAsk(G.ask.p, G.ask.k, true); }
function growAbout(id) {
  const G = growOf(st.cur), nx = growNext(G, id);
  st.growSel = null;
  if (nx) growAsk(nx.p, nx.k); else renderGrow();
}
function growUnpark(qid) {
  const G = growOf(st.cur), q = G.park.find(x => x.id === qid); if (!q || st.growRun) return;
  G.park = G.park.filter(x => x !== q);
  G.ask = {p: q.p, k: q.k, q: q.q, why: growTemplate(G, q.p, q.k).why, src: 'ai'};
  saveGrow(); renderGrow();
  const b = $('#growAns'); if (b) b.focus();
}
function growRemove(id) {
  const d = st.cur, G = growOf(d), gone = new Set([id]);
  for (let more = true; more;) { more = false; for (const n of G.nodes) if (!gone.has(n.id) && gone.has(n.p)) { gone.add(n.id); more = true; } }
  st.growUndo = {doc: d, n: gone.size, nodes: G.nodes.slice(), park: G.park.slice(), ask: G.ask, order: G.order.slice()};
  G.nodes = G.nodes.filter(n => !gone.has(n.id)); G.park = G.park.filter(q => !gone.has(q.p)); G.order = G.order.filter(x => !gone.has(x));
  if (G.ask && gone.has(G.ask.p)) G.ask = null;
  st.growSel = null; saveGrow(); renderGrow();
}
function growUndoIt() {
  const u = st.growUndo, G = growOf(st.cur); if (!u || u.doc !== st.cur) return;
  Object.assign(G, {nodes: u.nodes, park: u.park, ask: u.ask, order: u.order});
  st.growUndo = null; saveGrow(); renderBoard();
}

// ---- Unfold: the same answers at five levels of detail ----
const UNFOLD_LEVELS = ['One line', 'Reasons', 'Support', 'Paragraphs', 'Draft'];
const UNFOLD_TAG = {why: 'Backs it up', mean: 'What it means', follow: 'What follows', link: 'Connects', against: 'Objection', reply: 'Your reply'};
function renderUnfold() {
  if (st.mode !== 'plan' || !st.cur) return;
  const d = st.cur, G = growOf(d), L = st.unfoldLevel, focus = focusKey();
  const head = h('div', {class: 'phead'}, planTabs('unfold'),
    h('div', {class: 'ulevels', role: 'group', 'aria-label': 'How much detail'}, h('span', {class: 'fine'}, 'Detail'),
      UNFOLD_LEVELS.map((t, i) => h('button', {type: 'button', class: 'ulv', 'aria-pressed': String(L === i + 1), onclick: () => { st.unfoldLevel = i + 1; renderUnfold(); }}, (i + 1) + ' · ' + t))));
  if (!G.root.trim() && !G.nodes.length) {
    fill(boardEl, head, h('section', {class: 'empty uempty'}, h('h3', null, 'Unfold starts from your answers'),
      h('p', null, 'Answer a few questions in Grow, and your idea unfolds here: one line, your reasons, what backs them up, a plan for each paragraph, then the draft.'),
      h('button', {class: 'btn primary', type: 'button', onclick: () => { st.planView = 'grow'; renderBoard(); }}, 'Go to Grow')));
    return;
  }
  const reasons = growReasons(G), kids = id => growKidsOf(G, id), means = kids('').filter(n => n.k === 'mean'), links = kids('').filter(n => n.k === 'link');
  const objections = G.nodes.filter(n => n.k === 'against'), cols = 'grid-template-columns:repeat(' + Math.max(1, reasons.length + (reasons.length < 3 ? 1 : 0)) + ',minmax(0,1fr))';
  const level = (n, body, sum) => L >= n
    ? h('section', {class: 'ulevel' + (L === n ? ' here' : ''), 'aria-label': n + ' · ' + UNFOLD_LEVELS[n - 1]}, h('p', {class: 'ulab'}, n + ' · ' + UNFOLD_LEVELS[n - 1]), body)
    : h('button', {type: 'button', class: 'ulevel ushut', onclick: () => { st.unfoldLevel = n; renderUnfold(); }}, h('b', null, n + ' · ' + UNFOLD_LEVELS[n - 1]), h('span', null, sum));
  const gap = (title, q, p, k) => h('div', {class: 'ugap', style: '--kc:var(' + GROW_INFO[k].c + ')'}, h('b', null, title), h('p', null, q),
    h('button', {class: 'btn sm', type: 'button', onclick: () => unfoldAsk(p, k)}, 'Answer in Grow'));
  // a card for one answer; answers under it that aren't shown here are counted
  const card = n => { const more = kids(n.id).filter(x => !(n.k === 'against' && x.k === 'reply')).length;
    return h('div', {class: 'ucard', style: '--kc:var(' + GROW_INFO[n.k].c + ')'}, h('span', {class: 'uk'}, UNFOLD_TAG[n.k]), h('p', null, n.a),
      more ? h('span', {class: 'fine'}, plural(more, 'more answer') + ' in Grow') : null); };
  const name = (r, i) => 'Reason ' + (i + 1) + (r.k === 'follow' ? ' · what follows' : '');
  const support = (r, i) => {
    const list = kids(r.id).filter(n => n.k !== 'against' && n.k !== 'reply');
    return h('div', {class: 'ustack'}, h('p', {class: 'ufor'}, 'For ' + name(r, i).toLowerCase() + ': ' + trunc(r.a, 60)), list.map(card),
      list.some(n => n.k === 'why') ? null : gap('Needs support', 'What shows this is true: a fact, an example, a source?', r.id, 'why'));
  };
  const plans = [
    {h: 'Introduction', pts: [['Your point', G.line || G.root], ...means.map(m => ['What you mean', m.a])], gap: 'What’s at stake? Why should a reader care?'},
    ...reasons.map((r, i) => ({h: name(r, i) + ': ' + trunc(r.a, 70), pts: kids(r.id).filter(n => n.k !== 'against' && n.k !== 'reply').map(n => [UNFOLD_TAG[n.k], n.a]),
      gap: kids(r.id).some(n => n.k === 'why') ? '' : 'Needs support'})),
    objections.length ? {h: 'The other side', pts: objections.flatMap(o => [['Objection', o.a], ...kids(o.id).filter(n => n.k === 'reply').map(x => ['Your reply', x.a])]),
      gap: objections.some(o => !kids(o.id).some(n => n.k === 'reply')) ? 'An objection still needs your reply' : ''} : null,
    {h: 'Conclusion', pts: [['Your point, again', G.line || G.root], ...links.map(l => ['How it connects', l.a])], gap: 'So what? What should a reader think or do now?'},
  ].filter(Boolean);
  fill(boardEl, head, h('div', {class: 'unfold'},
    level(1, [
      h('textarea', {id: 'uline', class: 'uline', rows: 1, 'aria-label': 'Your point in one sentence', placeholder: 'Your point in one sentence',
        oninput: e => { G.line = clip(e.target.value, 600); fitArea(e.target); saveGrow(); }}, G.line || G.root),
      means.length ? h('p', {class: 'umean'}, 'What you mean: ' + means.map(m => m.a).join(' · ')) : null,
      G.line.trim() ? null : h('p', {class: 'fine'}, 'Can you say it in one sentence, with your main reason? For now it’s your starting thought.')], ''),
    level(2, h('div', {class: 'ugrid', style: cols},
      reasons.map((r, i) => h('div', {class: 'ureason', style: '--kc:var(' + GROW_INFO[r.k].c + ')'},
        h('span', {class: 'uk'}, name(r, i)), h('p', null, r.a),
        reasons.length > 1 ? h('span', {class: 'umove'},
          i ? h('button', {class: 'lnk', type: 'button', 'aria-label': 'Move “' + trunc(r.a, 40) + '” earlier', onclick: () => unfoldMove(r.id, -1)}, '← Earlier') : null,
          i < reasons.length - 1 ? h('button', {class: 'lnk', type: 'button', 'aria-label': 'Move “' + trunc(r.a, 40) + '” later', onclick: () => unfoldMove(r.id, 1)}, 'Later →') : null) : null)),
      reasons.length < 3 ? gap(reasons.length ? 'Another reason?' : 'Your first reason', reasons.length ? 'What else makes this true, or what follows if it is?' : 'Why do you believe it?', '', 'why') : null),
      plural(reasons.length, 'reason')),
    level(3, [
      reasons.length ? h('div', {class: 'ugrid', style: cols}, reasons.map(support), reasons.length < 3 ? h('div', {'aria-hidden': 'true'}) : null) : null,
      h('div', {class: 'uside' + (objections.length ? '' : ' none')},
        h('p', {class: 'ulab'}, 'The other side'),
        objections.length ? h('div', {class: 'ustack urow'}, objections.map(o => h('div', {class: 'upair'}, card(o),
          kids(o.id).some(n => n.k === 'reply') ? kids(o.id).filter(n => n.k === 'reply').map(card) : gap('Needs your reply', 'How would you answer it?', o.id, 'reply'))))
          : gap('Who would disagree?', 'Answer this before you plan paragraphs, so the objection gets a place in your essay rather than a footnote.', '', 'against'))],
      'what backs each reason up, and the other side'),
    level(4, h('ol', {class: 'uplans'}, plans.map((pl, i) => h('li', {class: 'uplan'}, h('b', null, '¶' + (i + 1) + ' ' + pl.h),
      pl.pts.length ? h('ul', null, pl.pts.map(([t, x]) => h('li', null, h('span', {class: 'uk'}, t), ' ' + x))) : null,
      pl.gap ? h('p', {class: 'ugapline'}, pl.gap) : null))), plural(plans.length, 'paragraph') + ' planned'),
    level(5, h('div', {class: 'udraft'},
      h('p', null, d.text.trim() ? 'Your essay has ' + plural(words(d.text), 'word') + '. You write the prose; this plan stays here beside it.' : 'You write the prose. Start with a heading for each paragraph in your plan.'),
      h('button', {class: 'btn primary', type: 'button', id: 'unfoldWrite', onclick: () => unfoldStart(plans)}, d.text.trim() ? 'Add the headings to the end of the essay' : 'Start writing')),
      'you write the prose')));
  for (const t of boardEl.querySelectorAll('#uline')) fitArea(t);
  restoreFocus(focus);
}
function unfoldMove(id, dir) {
  const G = growOf(st.cur), ids = growReasons(G).map(n => n.id), i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  G.order = ids; saveGrow(); renderUnfold();
}
function unfoldAsk(p, k) {
  const G = growOf(st.cur);
  if (!G.root.trim()) { st.planView = 'grow'; renderBoard(); return; }
  st.planView = 'grow'; st.growSel = null; G.ask = null; window.scrollTo(0, 0);
  growAsk(p, k);
}
function unfoldStart(plans) {
  const heads = plans.map(p => clip(p.h, 120).replace(/\s+/g, ' ')).filter(Boolean);
  setMode('write');
  const end = ed.value.replace(/\s+$/, '').length, add = (end ? '\n\n' : '') + heads.join('\n\n') + '\n\n';
  appEdit('outline', add.trim(), () => replaceRange(end, ed.value.length, add));
}
