// ---- notes rail ----
function renderHead() {
  const rv = st.cur.review, open = rv ? openIssues() : [], busy = st.reviewing && st.reviewing.doc === st.cur;
  rcount.textContent = busy ? 'reviewing…' : rv ? (open.length ? open.length + ' open' : 'all clear') : '';
  $('#acount').textContent = st.argRun && st.argRun.doc === st.cur ? 'mapping…' : '';
  chipsEl.replaceChildren();
  chipsEl.hidden = st.view !== 'notes' || !rv || !open.length;
  if (chipsEl.hidden) return;
  for (const [g, label] of GROUPS) {
    const n = g === 'all' ? open.length : open.filter(is => TYPES[is.type].g === g).length;
    if (g !== 'all' && !n) continue;
    chipsEl.append(h('button', {class: 'chip', 'aria-pressed': String(st.filter === g), onclick: e => { e.stopPropagation(); st.filter = st.filter === g ? 'all' : g; st.active = null; renderBackdrop(); renderRail(); scheduleLines(); }},
      g !== 'all' ? h('span', {class: 'sw', html: SW[g]}) : null, label, h('span', {class: 'n'}, n)));
  }
}
function renderRail() {
  if (!st.cur) return;
  renderHead();
  if (st.view === 'argument') { renderArg(); return; }
  const keep = rbody.scrollTop, d = st.cur, rv = d.review, kids = [];
  const busy = st.reviewing && st.reviewing.doc === d;
  if (busy) kids.push(progressEl());
  if (st.reviewError && st.reviewError.doc === d) kids.push(errorEl());
  if (d.isSample && st.loaded && !essayDocs().length) kids.push(startEl());
  for (const a of st.asks.get(d.id) || []) kids.push(askEl(a));
  if (!rv) { if (!busy) kids.push(emptyEl()); }
  else {
    kids.push(summaryEl(rv), timelineEl(d));
    const open = openIssues(), shown = open.filter(is => st.filter === 'all' || TYPES[is.type].g === st.filter);
    const done = rv.issues.filter(is => !isOpen(is));
    if (!open.length) kids.push(h('p', {class: 'clean'}, rv.issues.length ? 'Everything flagged has been dealt with. Review again to check your changes.' : 'No problems found. Nice work.'));
    else kids.push(h('ol', {class: 'cards'}, shown.map(cardEl)));
    if (done.length) kids.push(doneEl(done));
  }
  fill(rbody, kids);
  rbody.scrollTop = keep;
}
function startEl() {
  return h('section', {class: 'start'}, h('b', null, 'Try it on your own writing'),
    h('p', null, 'This is a sample. Upload essays (Word, PDF or text) or start a new one. Every essay you add also joins the library that reviews check against.'),
    h('div', {class: 'acts'}, h('button', {class: 'btn sm primary', onclick: () => pickFiles('essay')}, 'Upload essays'), h('button', {class: 'btn sm', onclick: newEssay}, 'New essay')));
}
function emptyEl() {
  const ctx = contextDocs(st.cur), nSrc = ctx.filter(x => x.role === 'source').length, nEss = ctx.length - nSrc;
  return h('section', {class: 'empty'},
    h('h3', null, 'No review yet'),
    h('p', null, 'Press Review and ' + AI + ' reads the whole essay, then marks what needs work:'),
    h('ul', {class: 'legend'}, LEGEND.map(([g, name, desc]) => h('li', null, h('span', {class: 'sw', html: SW[g]}), h('span', null, h('b', null, name), desc)))),
    h('p', null, 'Or select any sentence to ask about it. ' + AI + ' suggests; you decide what changes.'),
    words(ed.value) < 40 ? h('p', null, 'Not sure where to start? ', h('button', {class: 'lnk', onclick: () => setMode('plan')}, 'Plan it on the brainstorm board')) : null,
    h('p', null, nSrc || nEss ? 'It also checks this essay against ' + [nSrc ? plural(nSrc, 'source') : '', nEss ? 'your ' + plural(nEss, 'other essay') : ''].filter(Boolean).join(' and ') + '. ' : 'Add your brief and sources to check claims and citations too. ',
      h('button', {class: 'lnk', onclick: openSources}, 'Choose sources')));
}
function summaryEl(rv) {
  const s = rv.summary || {}, bits = [rv.tier === 'sample' ? 'Sample review' : 'Reviewed by ' + (rv.by || AI) + (rv.at ? ' · ' + ago(rv.at) : '')];
  if (rv.tier === 'test run 1') bits.push('from test run 1');
  const against = [rv.sources ? plural(rv.sources, 'source') : '', rv.checked ? plural(rv.checked, 'other essay') : ''].filter(Boolean);
  if (against.length) bits.push('checked against ' + against.join(' and '));
  if (rv.recheck) bits.push('re-checked ' + rv.recheck.changed + ' of ' + plural(rv.recheck.of, 'paragraph'));
  if (changedSinceReview()) bits.push('edited since');
  return h('section', {class: 'sum'},
    s.thesis ? h('div', {class: 'srow'}, h('span', {class: 'lbl'}, 'Main claim'), h('p', null, s.thesis)) : null,
    s.start_with ? h('div', {class: 'srow'}, h('span', {class: 'lbl'}, 'Start with'), h('p', null, s.start_with)) : null,
    briefEl(rv), linksEl(rv),
    h('p', {class: 'smeta'}, bits.join(' · '), rv.recheck && !st.reviewing ? [' · ', h('button', {class: 'lnk', onclick: () => runReview({full: true})}, 'Review everything')] : null),
    rv.tier === 'sample' ? null : h('div', {class: 'sdefend'}, h('button', {class: 'btn sm', type: 'button', id: 'defendBtn', onclick: openDefend}, 'Defend it'),
      h('span', null, 'Practise a viva on this essay’s weakest points.'), h('button', {class: 'lnk', type: 'button', id: 'recordBtn', onclick: openRecord}, 'Writing record')));
}
function whereText(is) {
  const an = st.anchors.get(is.id), pa = para(an.a[0]);
  if (TYPES[is.type].src) return '¶' + pa + (is.docB ? (is.type === 'library_clash' ? ' ↔ past essay' : ' ↔ source') : '');
  const pb = an.b ? para(an.b[0]) : pa;
  return pb !== pa ? '¶' + Math.min(pa, pb) + ' ↔ ¶' + Math.max(pa, pb) : '¶' + pa;
}
function cardEl(is) {
  const T = TYPES[is.type], on = st.active === is.id;
  const li = h('li', {class: 'card' + (on ? ' on' : ''), data: {id: is.id}, style: `--tc:var(${T.c})`,
    onmouseenter: () => setHover(is.id), onmouseleave: () => setHover(null)},
    h('button', {class: 'cbtn', 'aria-expanded': String(on), onclick: () => setActive(on ? null : is.id, 'text')},
      h('span', {class: 'kind'}, h('i', {class: 'dot'}), T.label, h('span', {class: 'where'}, whereText(is)), is.severity === 'high' ? h('span', {class: 'sev'}, 'High') : null),
      h('span', {class: 'ctitle'}, is.title || T.label)));
  if (on) li.append(moreEl(is));
  return li;
}
function quoteEl(text, label, onclick) {
  return h(onclick ? 'button' : 'div', {class: 'q', onclick, type: onclick ? 'button' : null}, h('span', {class: 'ql'}, label), h('span', {class: 'qt'}, '“' + trunc(text, 240) + '”'));
}
function diffEl(from, to) {
  return h('p', {class: 'diff'}, wordDiff(from, to).map(([k, s]) => k === '=' ? s : h(k === '-' ? 'del' : 'ins', null, s)));
}
function moreEl(is) {
  const an = st.anchors.get(is.id), box = h('div', {class: 'cmore'});
  if (TYPES[is.type].src) {
    const other = is.docB && st.docs.get(is.docB.id);
    box.append(quoteEl(is.qa, 'This essay · ¶' + para(an.a[0]), () => scrollToRange(an.a)));
    if (is.qb) box.append(quoteEl(is.qb, (is.docB && is.docB.title ? is.docB.title : 'Your other essay') + (other ? ' · open' : ''), other ? () => openReader(other, is.qb) : null));
  } else if (an.b) {
    box.append(quoteEl(is.qa, '¶' + para(an.a[0]), () => scrollToRange(an.a)), quoteEl(is.qb, '¶' + para(an.b[0]), () => scrollToRange(an.b)));
  }
  if (is.explanation) box.append(h('p', {class: 'why'}, is.explanation));
  if (is.fix) box.append(h('p', {class: 'fix'}, h('strong', null, 'Try: '), is.fix));
  if (is.suggestion && is.suggestion !== is.qa) {
    box.append(h('div', {class: 'sugg'}, h('span', {class: 'lbl'}, 'Suggested wording, if you agree'), diffEl(is.qa, is.suggestion),
      h('button', {class: 'btn sm primary', onclick: () => applyIssue(is)}, 'Apply')));
  }
  box.append(h('div', {class: 'acts'},
    narrow.matches ? h('button', {class: 'btn sm', onclick: () => { closeSheet(); scrollToIssue(is.id, 0.25); }}, 'Show in essay') : null,
    h('button', {class: 'btn sm ghost', onclick: () => markIssue(is.id, 'dismissed')}, 'Dismiss')));
  return box;
}
function doneEl(done) {
  const marks = st.cur.marks || {};
  return h('details', {class: 'done'}, h('summary', null, `Dealt with (${done.length})`),
    h('ul', null, done.map(is => h('li', null, h('span', null, is.title || TYPES[is.type].label),
      marks[is.id] === 'dismissed' ? h('button', {class: 'btn sm ghost', onclick: () => markIssue(is.id, null)}, 'Restore') : h('span', {class: 'st'}, marks[is.id] === 'applied' ? 'Applied' : 'Changed')))));
}
function progressEl() {
  const R = st.reviewing;
  return h('section', {class: 'prog', 'aria-live': 'polite'}, h('div', {class: 'pbar'}, h('i')),
    h('div', {class: 'ptxt'}, h('b', {id: 'ptitle'}, progTitle()), h('span', {id: 'ptime'}, progSub())),
    h('button', {class: 'btn sm', onclick: () => R.ctl.abort()}, 'Stop'));
}
function progTitle() { const R = st.reviewing; return !R ? '' : R.writing ? 'Writing up notes · ' + R.found + ' so far' : R.stage || (R.recheck ? 'Re-checking ' + plural(R.recheck, 'changed paragraph') + '…' : 'Reading your essay…'); }
function progSub() {
  const R = st.reviewing; if (!R) return '';
  const s = Math.floor((Date.now() - R.t0) / 1000);
  return (R.tier === 'complex' ? 'Thorough' : 'Faster') + ' review · ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + (R.lib || R.src ? ' · with ' + [R.src ? plural(R.src, 'source') : '', R.lib ? plural(R.lib, 'other essay') : ''].filter(Boolean).join(' and ') : '');
}
function updateProgress() { const a = $('#ptitle'), b = $('#ptime'); if (a) a.textContent = progTitle(); if (b) b.textContent = progSub(); }
function errorEl() {
  const e = st.reviewError.err, hard = isHard(e);
  return h('section', {class: 'errc', role: 'alert'}, h('b', null, 'The review didn’t finish'), h('p', null, errText(e)), hard ? null : h('button', {class: 'btn sm', onclick: runReview}, 'Try again'));
}
function askEl(a) {
  const card = h('section', {class: 'askc', onmouseenter: () => { st.askHover = a.id; renderBackdrop(); }, onmouseleave: () => { st.askHover = null; renderBackdrop(); }},
    h('div', {class: 'ahead'}, h('span', null, a.label), h('button', {class: 'x', 'aria-label': 'Close this answer', onclick: () => closeAsk(a)}, '×')),
    h('p', {class: 'aq'}, '“' + trunc(a.sel, 220) + '”'));
  if (a.state === 'loading') card.append(h('div', {class: 'thinking'}, h('span', {class: 'spin'}), 'Thinking…', h('button', {class: 'btn sm ghost', onclick: () => a.ctl.abort()}, 'Stop')));
  else if (a.state === 'done') {
    card.append(h('ul', {class: 'pts'}, a.points.map(p => h('li', null, p.label ? h('strong', null, p.label + '. ') : null, p.detail))));
    if (a.suggestion && !a.applied) card.append(h('div', {class: 'sugg'}, h('span', {class: 'lbl'}, 'Suggested wording, if you agree'), diffEl(a.sel, a.suggestion), h('button', {class: 'btn sm primary', onclick: () => applyAsk(a)}, 'Apply')));
    if (a.applied) card.append(h('p', {class: 'applied'}, 'Applied to your essay'));
  } else if (a.state === 'error') card.append(h('p', {class: 'clean'}, errText(a.err)), isHard(a.err) ? null : h('button', {class: 'btn sm', onclick: () => retryAsk(a)}, 'Try again'));
  else card.append(h('p', {class: 'clean'}, 'Stopped.'));
  return card;
}

function briefEl(rv) {
  const items = rv.brief || [];
  if (!items.length) return null;
  const n = items.filter(b => b.status === 'covered').length, mark = {covered: '✓', partial: '◐', missing: '○'};
  return h('details', {class: 'brief', open: n < items.length},
    h('summary', null, h('span', {class: 'lbl'}, 'Brief'), h('span', {class: 'bsum'}, n + ' of ' + items.length + ' covered'),
      h('span', {class: 'bbar', role: 'img', 'aria-label': n + ' of ' + items.length + ' parts of the brief covered'}, items.map(b => h('i', {class: 'b-' + b.status})))),
    h('ul', {class: 'blist'}, items.map(b => {
      const r = b.qa ? anchorExact(ed.value, b.qa) : null;
      return h('li', {class: 'b-' + b.status}, h('span', {class: 'bst', 'aria-hidden': 'true'}, mark[b.status]),
        h('span', {class: 'btx'}, h('b', null, b.requirement), h('span', {class: 'sub'}, (b.status === 'missing' ? 'Missing. ' : b.status === 'partial' ? 'Partly covered. ' : '') + b.note)),
        r ? h('button', {class: 'btn sm ghost', onclick: () => scrollToRange(r)}, '¶' + para(r[0])) : null);
    })));
}
function linksEl(rv) {
  const ls = (rv.links || []).map(l => ({l, r: anchorExact(ed.value, l.qa)})).filter(x => x.r);
  if (!ls.length) return null;
  return h('details', {class: 'brief'},
    h('summary', null, h('span', {class: 'lbl'}, 'Backed by your sources'), h('span', {class: 'bsum'}, plural(ls.length, 'passage'))),
    h('ul', {class: 'blist'}, ls.map(({l, r}) => {
      const doc = st.docs.get(l.docB.id);
      return h('li', {class: 'b-covered'}, h('span', {class: 'bst', 'aria-hidden': 'true'}, '✓'),
        h('span', {class: 'btx'}, h('b', null, '“' + trunc(l.qa, 90) + '”'), h('span', {class: 'sub'}, 'Supported by ' + l.docB.title)),
        h('span', {class: 'bacts'}, h('button', {class: 'btn sm ghost', onclick: () => scrollToRange(r)}, '¶' + para(r[0])),
          doc ? h('button', {class: 'btn sm ghost', onclick: () => openReader(doc, l.qb)}, 'Open') : null));
    })));
}
