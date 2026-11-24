// ---- brainstorm board: plan the essay as cards, then an outline ----
// Plan mode swaps the paper and the notes for a board. Claude asks questions back and offers angles,
// objections and passages from the writer's sources as cards; the writer keeps, bins and edits them and
// drags them into an outline. "Start writing" adds the outline to the essay as headings, never prose.
const boardEl = $('#board'), layoutEl = $('.layout');
const ic = d => '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON = {pin: ic('M6 2.5h4l-.5 3.5 2.3 2.5H4.2l2.3-2.5zM8 8.5V14'), bin: ic('M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 8.5h4.8l.6-8.5'),
  up: ic('M4 10l4-4 4 4'), down: ic('M4 6l4 4 4-4'), indent: ic('M3 4h10M7 8h6M7 12h6M3 7l2 1.5L3 10'), outdent: ic('M3 4h10M7 8h6M7 12h6M5 7 3 8.5 5 10'), x: ic('M4.5 4.5l7 7M11.5 4.5l-7 7')};
const planOf = d => d.plan || (d.plan = {q: '', at: 0, cards: [], outline: []});
const inOutline = P => new Set(P.outline.flatMap(o => [o.id, ...o.subs]));
const headingFrom = t => trunc(String(t || '').replace(/\s+/g, ' ').replace(/[.!?:;,]+$/, ''), 80);

// Plan shows the board, Write the essay, Compare (opened from the drafts strip) two drafts side by side, and Map
// the whole library.
function setMode(m) {
  if (m !== 'plan' && m !== 'write' && m !== 'compare' && m !== 'map') return;
  st.mode = m;
  layoutEl.classList.toggle('planning', m === 'plan');
  layoutEl.classList.toggle('comparing', m === 'compare');
  layoutEl.classList.toggle('mapping', m === 'map');
  boardEl.hidden = m !== 'plan'; cmpEl.hidden = m !== 'compare'; mapEl.hidden = m !== 'map';
  for (const b of document.querySelectorAll('.mode')) b.setAttribute('aria-pressed', String(b.dataset.mode === (m === 'compare' ? 'write' : m)));
  hideSelbar(); closePop();
  if (m === 'plan') { closeSheet(); renderBoard(); window.scrollTo(0, 0); }
  else if (m === 'compare') { closeSheet(); renderCompare(); window.scrollTo(0, 0); }
  else if (m === 'map') { closeSheet(); renderMap(); window.scrollTo(0, 0); }
  else { fitTitle(); refresh(); }
}
function savePlan() { const d = ensureReal(st.cur); planOf(d).at = Date.now(); d.updatedAt = Date.now(); persist(d); }
function defaultQuestion(d) {
  const b = d.brief && d.brief.text.trim(), first = b ? (b.match(/[^.?!\n]+[.?!]?/) || [''])[0].trim() : '';
  return (first || d.title || '').slice(0, 300);
}
function contextLine(d) {
  const ctx = contextDocs(d), nSrc = ctx.filter(x => x.role === 'source').length, nEss = ctx.length - nSrc;
  const bits = [d.brief && d.brief.text.trim() ? 'your brief' : '', nSrc ? plural(nSrc, 'source') : '', nEss ? plural(nEss, 'past essay') : ''].filter(Boolean);
  return bits.length ? 'Ideas draw on ' + bits.join(', ').replace(/, ([^,]*)$/, ' and $1') + '.' : 'Add your brief or sources to ground the ideas in them.';
}

// ---- the board ----
function renderBoard() {
  if (st.mode !== 'plan' || !st.cur) return;
  const d = st.cur, P = planOf(d), busy = !!(st.ideaRun && st.ideaRun.doc === d), off = st.ai === 'denied' || st.ai === 'off';
  const used = inOutline(P), live = P.cards.filter(c => !c.binned && !used.has(c.id)), binned = P.cards.filter(c => c.binned && !used.has(c.id));
  const err = st.ideaErr && st.ideaErr.doc === d ? st.ideaErr.err : null, focus = focusKey();
  fill(boardEl,
    h('div', {class: 'bhead'},
      h('label', {class: 'lbl', for: 'bq'}, 'The question'),
      h('textarea', {id: 'bq', class: 'bq', rows: 1, placeholder: 'What is the essay trying to answer?', oninput: onQuestion,
        onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runIdeas(); } }}, P.q || defaultQuestion(d)),
      P.cards.length ? null : h('p', {class: 'bintro'}, 'Claude asks questions back and offers angles, objections and passages from your sources as cards. Keep the good ones, bin the rest, and drag them into an outline. Nothing is written for you.'),
      h('div', {class: 'acts bacts'},
        h('button', {class: 'btn primary', id: 'ideaBtn', onclick: runIdeas, disabled: busy || off}, busy ? h('span', {class: 'spin'}) : null, h('span', null, busy ? st.ideaRun.stage || 'Thinking…' : P.cards.length ? 'More ideas' : 'Suggest ideas')),
        busy ? h('button', {class: 'btn ghost', onclick: () => st.ideaRun && st.ideaRun.ctl.abort()}, 'Stop') : null,
        h('span', {class: 'fine'}, off && st.aiWhy ? st.aiWhy : contextLine(d), ' ', h('button', {class: 'lnk', onclick: openSources}, 'Choose sources'))),
      err ? h('p', {class: 'berr', role: 'alert'}, 'No new ideas this time. ' + errText(err)) : null),
    h('div', {class: 'bgrid'},
      h('div', {class: 'clusters', ondragover: onBoardOver, ondrop: onBoardDrop}, KIND_ORDER.map(k => clusterEl(k, live.filter(c => c.kind === k)))),
      outlineEl(P)),
    binned.length ? h('details', {class: 'binned'}, h('summary', null, 'Binned (' + binned.length + ')'),
      h('ul', null, binned.map(c => h('li', {style: '--kc:var(' + IDEA_INFO[c.kind].c + ')'}, h('i', {class: 'kdot'}), h('span', null, c.text),
        h('button', {class: 'btn sm ghost', onclick: () => { c.binned = false; savePlan(); renderBoard(); }}, 'Restore'))))) : null);
  fitAreas();
  restoreFocus(focus);
}
// Re-rendering keeps the writer's place: the field they were typing in keeps focus and caret.
function focusKey() {
  const a = document.activeElement;
  if (!a || !boardEl.contains(a) || !/^(TEXTAREA|INPUT)$/.test(a.tagName)) return null;
  const card = a.closest('[data-id]'), cls = (a.className || '').split(' ')[0];
  if (!a.id && !cls) return null;
  return {sel: a.id ? '#' + a.id : (card ? '[data-id="' + card.dataset.id + '"] ' : '') + '.' + cls, s: a.selectionStart, e: a.selectionEnd};
}
function restoreFocus(f) {
  if (st.focusAdd) { const i = boardEl.querySelector('.cluster[data-kind="' + st.focusAdd + '"] .iadd input'); st.focusAdd = null; if (i) { i.focus(); return; } }
  let el = null; try { el = f && boardEl.querySelector(f.sel); } catch (err) {}
  if (el) { el.focus({preventScroll: true}); try { el.setSelectionRange(f.s, f.e); } catch (err) {} }
}
function onQuestion(e) { planOf(st.cur).q = e.target.value.slice(0, 600); fitArea(e.target); savePlan(); }
function fitArea(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
function fitAreas() { for (const t of boardEl.querySelectorAll('#bq, .olabel, .ians')) fitArea(t); }
function clusterEl(kind, cards) {
  const I = IDEA_INFO[kind];
  cards.sort((a, b) => b.kept - a.kept);
  return h('section', {class: 'cluster', data: {kind}, style: '--kc:var(' + I.c + ')', 'aria-label': I.title},
    h('div', {class: 'chead'}, h('i', {class: 'kdot'}), h('b', null, I.title), h('span', {class: 'n'}, cards.length || '')),
    h('p', {class: 'khint'}, I.hint),
    cards.length ? h('ul', {class: 'kcards'}, cards.map(ideaCardEl)) : null,
    kind === 'source' ? (cards.length ? null : h('p', {class: 'khint'}, 'Switch sources on for this essay and Claude will find passages that matter.')) : addEl(kind));
}
function ideaCardEl(c) {
  const I = IDEA_INFO[c.kind];
  return h('li', {class: 'icard' + (c.kept ? ' kept' : '') + (c.own ? ' own' : ''), draggable: 'true', data: {id: c.id}, style: '--kc:var(' + I.c + ')',
      ondragstart: e => dragStart(e, c.id), ondragend: dragEnd},
    h('p', {class: 'itext', tabindex: '0', role: 'button', 'aria-label': 'Edit: ' + c.text, onclick: e => editText(e.currentTarget, c),
      onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); editText(e.currentTarget, c); } }}, c.text),
    c.src ? h('button', {class: 'q isrc', type: 'button', onclick: () => openSource(c.src)}, h('span', {class: 'ql'}, c.src.title + ' · open'), h('span', {class: 'qt'}, '“' + trunc(c.src.quote, 220) + '”')) : null,
    c.kind === 'question' ? h('textarea', {class: 'ians', rows: 2, placeholder: 'Your answer', 'aria-label': 'Your answer', oninput: e => { c.answer = e.target.value.slice(0, 800); fitArea(e.target); savePlan(); }}, c.answer || '') : null,
    h('div', {class: 'iacts'},
      h('button', {class: 'ib', type: 'button', 'aria-pressed': String(c.kept), 'aria-label': 'Keep', title: c.kept ? 'Kept' : 'Keep', onclick: () => { c.kept = !c.kept; savePlan(); renderBoard(); }, html: ICON.pin}),
      h('button', {class: 'ib', type: 'button', 'aria-label': 'Bin', title: 'Bin', onclick: () => { c.binned = true; c.kept = false; savePlan(); renderBoard(); }, html: ICON.bin}),
      h('button', {class: 'ib go', type: 'button', 'aria-label': 'Add to the outline', onclick: () => placeCard(c.id, {i: planOf(st.cur).outline.length, where: 'before'})}, 'Outline →')));
}
function addEl(kind) {
  const I = IDEA_INFO[kind];
  return h('form', {class: 'iadd', onsubmit: e => {
    e.preventDefault(); const t = clip(e.target.elements.t.value, 400); if (!t) return;
    st.focusAdd = kind; addCards([{kind, text: t, own: true}]);
  }}, h('input', {name: 't', placeholder: '+ Your own ' + I.label.toLowerCase(), 'aria-label': 'Add your own ' + I.label.toLowerCase(), autocomplete: 'off', maxlength: 400}));
}
function editText(el, c) {
  const ta = h('textarea', {class: 'iedit', rows: 3, 'aria-label': 'Edit this card'}, c.text);
  let closed = false;
  const close = save => {
    if (closed) return; closed = true;
    const v = clip(ta.value, 400);
    if (save && v && v !== c.text) { c.text = v; savePlan(); }
    renderBoard();
  };
  ta.addEventListener('blur', () => close(true));
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); close(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
  });
  const card = el.closest('.icard'); if (card) card.draggable = false;
  el.replaceWith(ta); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
}
function openSource(src) { const d = st.docs.get(src.id); if (d) openReader(d, src.quote); else toast('That source is no longer in your library.'); }

// ---- the outline ----
function outlineEl(P) {
  const byId = new Map(P.cards.map(c => [c.id, c]));
  return h('aside', {class: 'outline', 'aria-label': 'Outline', ondragover: onOutlineOver, ondragleave: onOutlineLeave, ondrop: onOutlineDrop},
    h('div', {class: 'chead'}, h('b', null, 'Outline'), h('span', {class: 'n'}, P.outline.length || '')),
    P.outline.length ? h('ol', {class: 'oitems'}, P.outline.map((o, i) => outlineItemEl(o, i, byId, P.outline.length)))
      : h('p', {class: 'khint ohint'}, 'Drag cards here, or press “Outline →” on a card. Drop a card onto a point to group it under that point.'),
    h('div', {class: 'acts'}, h('button', {class: 'btn sm primary', id: 'startBtn', onclick: startWriting, disabled: !P.outline.length}, 'Start writing')),
    h('p', {class: 'fine'}, 'Adds the outline to your essay as headings, never as prose.'));
}
function outlineItemEl(o, i, byId, n) {
  const c = byId.get(o.id), I = IDEA_INFO[c.kind];
  return h('li', {class: 'oitem', draggable: 'true', data: {id: o.id}, style: '--kc:var(' + I.c + ')', ondragstart: e => dragStart(e, o.id), ondragend: dragEnd},
    h('div', {class: 'orow'},
      h('span', {class: 'onum'}, i + 1),
      h('textarea', {class: 'olabel', rows: 1, maxlength: 120, 'aria-label': 'Point ' + (i + 1),
        oninput: e => { o.label = e.target.value.replace(/\s+/g, ' ').slice(0, 120); fitArea(e.target); savePlan(); },
        onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}, o.label || headingFrom(c.text)),
      h('span', {class: 'oacts'},
        h('button', {class: 'ib', type: 'button', 'aria-label': 'Move up', title: 'Move up', disabled: i === 0, onclick: () => moveItem(i, -1), html: ICON.up}),
        h('button', {class: 'ib', type: 'button', 'aria-label': 'Move down', title: 'Move down', disabled: i === n - 1, onclick: () => moveItem(i, 1), html: ICON.down}),
        i ? h('button', {class: 'ib', type: 'button', 'aria-label': 'Group under the point above', title: 'Group under the point above', onclick: () => indentItem(i), html: ICON.indent}) : null,
        h('button', {class: 'ib', type: 'button', 'aria-label': 'Back to the board', title: 'Back to the board', onclick: () => fromOutline(o.id), html: ICON.x}))),
    o.subs.length ? h('ul', {class: 'osubs'}, o.subs.map(id => {
      const s = byId.get(id);
      return h('li', {style: '--kc:var(' + IDEA_INFO[s.kind].c + ')', draggable: 'true', data: {id}, ondragstart: e => dragStart(e, id), ondragend: dragEnd},
        h('span', null, s.text), h('button', {class: 'ib', type: 'button', 'aria-label': 'Make it its own point', title: 'Make it its own point', onclick: () => outdentSub(i, id), html: ICON.outdent}));
    })) : null);
}
function moveItem(i, dir) { const L = planOf(st.cur).outline, j = i + dir; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; savePlan(); renderBoard(); }
function indentItem(i) { const L = planOf(st.cur).outline; if (i < 1) return; const [o] = L.splice(i, 1); L[i - 1].subs = L[i - 1].subs.concat(o.id, o.subs).slice(0, 12); savePlan(); renderBoard(); }
function outdentSub(i, id) { const L = planOf(st.cur).outline, k = L[i].subs.indexOf(id); if (k < 0) return; L[i].subs.splice(k, 1); L.splice(i + 1, 0, {id, label: '', subs: []}); savePlan(); renderBoard(); }
function fromOutline(id) {
  const L = planOf(st.cur).outline, at = L.findIndex(o => o.id === id);
  if (at >= 0) L.splice(at, 1); else for (const o of L) { const k = o.subs.indexOf(id); if (k >= 0) o.subs.splice(k, 1); }
  savePlan(); renderBoard();
}
// Put a card (or an outline point, with its sub-points) at t: {i, where: 'before' | 'into'}.
function placeCard(id, t) {
  const P = planOf(st.cur);
  let moved = {id, label: '', subs: []};
  const at = P.outline.findIndex(o => o.id === id);
  if (at >= 0) {
    if (t.where === 'into' && t.i === at) { renderBoard(); return; }
    moved = P.outline.splice(at, 1)[0];
    if (t.i > at) t.i--;
  } else {
    if (!P.outline.some(o => o.subs.includes(id)) && P.outline.length >= 80) { toast('The outline is full.'); return; }
    for (const o of P.outline) { const k = o.subs.indexOf(id); if (k >= 0) o.subs.splice(k, 1); }
  }
  const c = P.cards.find(x => x.id === id); if (c) c.binned = false;
  const target = t.where === 'into' ? P.outline[t.i] : null;
  if (target) target.subs = target.subs.concat(moved.id, moved.subs).slice(0, 12);
  else P.outline.splice(Math.max(0, Math.min(t.i, P.outline.length)), 0, moved);
  savePlan(); renderBoard();
}

// ---- dragging: cards into the outline, points around it, and back to the board ----
function dragStart(e, id) {
  e.stopPropagation(); st.dragId = id;
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', ' '); } catch (err) {}
  const el = e.currentTarget; requestAnimationFrame(() => el.classList.add('dragging'));
}
function dragEnd() { st.dragId = null; showDrop(null); for (const el of boardEl.querySelectorAll('.dragging')) el.classList.remove('dragging'); }
function dropAt(e) {
  const items = [...boardEl.querySelectorAll('.oitem')];
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect(), edge = Math.min(14, r.height * 0.3);
    if (e.clientY < r.top + edge) return {i, where: 'before'};
    if (e.clientY < r.bottom - edge) return {i, where: 'into'};
  }
  return {i: items.length, where: 'before'};
}
function showDrop(t) {
  const items = boardEl.querySelectorAll('.oitem');
  items.forEach((el, i) => { el.classList.toggle('drop-into', !!t && t.where === 'into' && t.i === i); el.classList.toggle('drop-before', !!t && t.where === 'before' && t.i === i); });
  const box = boardEl.querySelector('.outline'); if (box) box.classList.toggle('drop-end', !!t && t.i === items.length);
}
function onOutlineOver(e) { if (!st.dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; showDrop(dropAt(e)); }
function onOutlineLeave(e) { if (!e.currentTarget.contains(e.relatedTarget)) showDrop(null); }
function onOutlineDrop(e) { if (!st.dragId) return; e.preventDefault(); const id = st.dragId; st.dragId = null; showDrop(null); placeCard(id, dropAt(e)); }
function onBoardOver(e) { if (st.dragId && inOutline(planOf(st.cur)).has(st.dragId)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }
function onBoardDrop(e) { if (!st.dragId) return; e.preventDefault(); const id = st.dragId; st.dragId = null; fromOutline(id); }

// ---- from outline to essay: headings only ----
function startWriting() {
  const P = planOf(st.cur), byId = new Map(P.cards.map(c => [c.id, c]));
  const heads = P.outline.map(o => clip(o.label || headingFrom((byId.get(o.id) || {}).text), 120).replace(/\s+/g, ' ')).filter(Boolean);
  if (!heads.length) { toast('Put some cards in the outline first.'); return; }
  setMode('write');
  const end = ed.value.replace(/\s+$/, '').length;
  replaceRange(end, ed.value.length, (end ? '\n\n' : '') + heads.join('\n\n') + '\n\n');
}

// ---- the AI call (only when the writer asks) ----
function ideasPrompt(d, q, ctx) {
  const P = planOf(d), byId = new Map(P.cards.map(c => [c.id, c])), used = inOutline(P), one = s => String(s || '').replace(/\s+/g, ' ');
  const line = c => '- (' + c.kind + ') ' + one(c.text) + (c.kind === 'question' && c.answer.trim() ? '\n  The writer’s answer: ' + one(c.answer) : '');
  const outline = P.outline.map((o, i) => (i + 1) + '. ' + one(o.label || (byId.get(o.id) || {}).text) + o.subs.map(s => '\n   - ' + one((byId.get(s) || {}).text)).join('')).join('\n');
  const board = P.cards.filter(c => !c.binned && !used.has(c.id)), binned = P.cards.filter(c => c.binned);
  const plan = [outline && 'OUTLINE:\n' + outline, board.length && 'CARDS ON THE BOARD:\n' + board.map(line).join('\n'), binned.length && 'BINNED CARDS:\n' + binned.map(line).join('\n')].filter(Boolean).join('\n\n');
  const brief = d.brief && d.brief.text.trim() ? '\n\nBRIEF (the assignment question or marking criteria):\n<brief>\n' + fence(d.brief.text) + '\n</brief>' : '';
  return IDEA_RULES + '\n\nESSAY TITLE: ' + docLabel(d) + '\n\nQUESTION:\n<question>\n' + fence(q) + '\n</question>' + brief +
    '\n\nPLAN (the writer’s cards so far):\n<plan>\n' + fence(plan || 'No cards yet.') + '\n</plan>\n\n' +
    (ctx.length ? 'DOCUMENTS (role "source": material the writer uses; role "essay": the writer’s earlier essays):\n' + docsBlock(ctx) : 'DOCUMENTS: none.');
}
async function runIdeas() {
  if (st.ideaRun) return;
  const d = st.cur, bq = $('#bq'), q = clip(bq ? bq.value : '', 600);
  if (!q) { toast('Write the question first.'); if (bq) bq.focus(); return; }
  if (st.ai === 'pending') await capsReady;
  if (!sampleFn || st.ai !== 'ready') { toast(st.aiWhy || 'AI isn’t available in this view.'); return; }
  planOf(d).q = q;
  const tier = pickTier(), R = st.ideaRun = {doc: d, ctl: new AbortController(), stage: ''};
  st.ideaErr = null; renderBoard();
  try {
    await ensureIndexed(contextDocs(d).slice(0, LIMITS.contextDocs), (i, n) => { R.stage = 'Reading your sources · ' + i + ' of ' + n; const b = $('#ideaBtn span:last-child'); if (b) b.textContent = R.stage; });
    if (R.ctl.signal.aborted) throw {code: 'cancelled'};
    R.stage = '';
    const own = bytes(ideasPrompt(d, q, []));
    if (own > LIMITS.promptBytes) throw {code: 'prompt_too_large'};
    const ctx = buildContext(d, own);
    let prompt = ideasPrompt(d, q, ctx);
    while (bytes(prompt) > LIMITS.promptBytes && ctx.length) { ctx.pop(); prompt = ideasPrompt(d, q, ctx); }
    const opts = {signal: R.ctl.signal}; if (tier) opts.modelTier = tier;
    const cards = validateIdeas(await sampleFn.json(prompt, opts), {resolveDoc: ctxResolver(ctx), have: planOf(d).cards.map(c => c.text)});
    if (!cards.length) throw {code: 'empty_completion'};
    addCards(cards, d);
    toast(plural(cards.length, 'new card'));
  } catch (err) {
    if (!(err && err.code === 'cancelled')) { st.ideaErr = {doc: d, err}; noteAiError(err); }
  } finally {
    st.ideaRun = null; renderBoard();
  }
}
function addCards(list, doc) {
  const d = ensureReal(doc || st.cur), P = planOf(d);
  for (const c of list) P.cards.push({id: 'k' + newId().slice(-12), kind: c.kind, text: c.text, own: !!c.own, kept: false, binned: false, answer: '', src: c.src || null});
  // Bounded: past 120 cards, the oldest binned ones go first.
  const used = inOutline(P);
  while (P.cards.length > 120) { const i = P.cards.findIndex(c => c.binned && !used.has(c.id)); if (i < 0) break; P.cards.splice(i, 1); }
  savePlan(); renderBoard();
}
// On narrow screens only the other mode's button shows, so focus moves to it after a switch.
for (const b of document.querySelectorAll('.mode')) b.addEventListener('click', () => {
  setMode(b.dataset.mode);
  if (!b.offsetParent) { const o = [...document.querySelectorAll('.mode')].find(x => x.offsetParent); if (o) o.focus({preventScroll: true}); }
});
