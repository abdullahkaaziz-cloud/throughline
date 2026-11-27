// ---- the first ten minutes: a guided first review on the writer's own essay, and a key to the colours ----
// Once someone has an essay of their own with some length to it, a note by the Review button offers the first review.
// When that review comes back, three short steps show where the notes are, how they're marked in the essay, and what
// to do with one. It never takes focus from the essay, Esc closes it, and it's shown once (kept in 'settings').
// Tab reaches it straight after the essay.
const GKEY = 'throughline.tour.v1';
let coach = null, coachRaf = 0, coachTick = 0, nudged = false, guideT = 0;
const ownEssay = d => !!d && !d.isSample && d.role !== 'source' && !sampleCopy(d);
const reviewedBefore = () => essayDocs().some(d => ownEssay(d) && d.review && d.review.tier !== 'sample');
function tourDone() { try { if (localStorage.getItem(GKEY)) return true; } catch (e) {} return !!(st.settings && st.settings.tour); }
function markTour() {
  try { localStorage.setItem(GKEY, '1'); } catch (e) {}
  if (st.store === 'db' && dbApi && myId) { st.settings = Object.assign({}, trackPrefs(), {tour: Date.now()}); saveSpecial('settings').catch(() => {}); }
}
// Closing it with the keyboard on it hands focus on: to back, or the note it opened, or the essay.
function closeCoach(back) {
  if (!coach) return;
  const had = coach.el.contains(document.activeElement);
  coach.el.remove(); coach = null; clearInterval(coachTick);
  if (had) { const t = back || rbody.querySelector('.card.on .cbtn') || ed; if (t && t.isConnected) t.focus({preventScroll: true}); }
}
const nudgeCoach = () => { if (coach && !coachRaf) coachRaf = requestAnimationFrame(() => { coachRaf = 0; placeCoach(); }); };
addEventListener('scroll', nudgeCoach, {passive: true, capture: true});
addEventListener('resize', nudgeCoach);
// One step: a small card beside what it's about (or under the bar, on a phone).
// It sits in the page just before the notes, so Tab reaches it straight after the essay; a step that follows one
// reached by keyboard takes the focus with it.
function showCoach(anchor, title, body, acts, step, side) {
  const had = !!coach && coach.el.contains(document.activeElement);
  if (coach) { coach.el.remove(); coach = null; clearInterval(coachTick); }
  const el = h('div', {class: 'coach', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'coachT', 'aria-live': 'polite'},
    h('div', {class: 'chd'}, step ? h('span', {class: 'cstep'}, step) : null, h('b', {id: 'coachT'}, title)),
    h('div', {class: 'cbody'}, body),
    h('div', {class: 'cacts'}, acts));
  rail.before(el);
  coach = {el, anchor, step, side};
  placeCoach(); coachTick = setInterval(placeCoach, 300);
  if (had) { const f = el.querySelector('.btn.primary'); if (f) f.focus({preventScroll: true}); }
}
function placeCoach() {
  if (!coach) return;
  const el = coach.el, a = typeof coach.anchor === 'function' ? coach.anchor() : coach.anchor, r = a && a.isConnected ? a.getBoundingClientRect() : null;
  if (narrow.matches || !r || !r.width) { el.classList.add('free'); el.style.left = el.style.top = ''; }
  else {
    el.classList.remove('free');
    const w = el.offsetWidth, ht = el.offsetHeight, below = r.bottom + 10 + ht < innerHeight;
    if (coach.side === 'left' && r.left - w - 14 > 8) {   // beside it, level with its top
      el.style.left = (r.left - w - 14) + 'px';
      el.style.top = Math.max(70, Math.min(r.top + 8, innerHeight - ht - 8)) + 'px';
    } else {
      el.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
      el.style.top = (below ? r.bottom + 10 : Math.max(70, r.top - ht - 10)) + 'px';
    }
  }
}
// Before the first review: offered once the essay is the writer's own and long enough to be worth it.
function maybeNudge() {
  clearTimeout(guideT);
  guideT = setTimeout(() => {
    const d = st.cur;
    if (nudged || coach || tourDone() || reviewedBefore() || st.mode !== 'write' || !ownEssay(d) || d.review || st.reviewing || !dlgEl.hidden || !reader.hidden || !srcWrap.hidden || st.ai === 'denied' || st.ai === 'off' || words(ed.value) < 80) return;
    nudged = true;
    showCoach(reviewBtn, 'Ready for your first review?', h('p', null, 'Press Review and Claude reads your whole essay, then marks what needs work right where it is. It never rewrites your essay: you decide what changes.'),
      [h('button', {class: 'btn sm primary', type: 'button', id: 'coachGo', onclick: () => { closeCoach(reviewBtn); runReview(); }}, 'Review now'),
        h('button', {class: 'btn sm ghost', type: 'button', onclick: () => closeCoach(ed)}, 'Not now')]);
  }, 1200);
}
// After it: three steps.
function maybeTour(d) {
  if (tourDone() || !ownEssay(d)) return;
  // After the review has been drawn: the notes are only placed in the text then.
  setTimeout(() => { if (st.cur === d && d.review && st.mode === 'write' && openIssues().length) tourStep(1); }, 500);
}
function restartTour() { try { localStorage.removeItem(GKEY); } catch (e) {} if (st.settings) st.settings.tour = 0; closeCoach(); if (st.cur && st.cur.review && openIssues().length) tourStep(1); else toast('Open an essay with notes, and the tour starts there.'); }
function tourStep(n) {
  if (st.mode !== 'write' || !st.cur || !st.cur.review) { closeCoach(); return; }
  const open = openIssues(), first = open[0], skip = h('button', {class: 'btn sm ghost', type: 'button', onclick: () => { closeCoach(); markTour(); }}, 'Skip');
  const next = k => h('button', {class: 'btn sm primary', type: 'button', id: 'coachNext', onclick: () => tourStep(k)}, 'Next');
  if (!first) { closeCoach(); return; }
  if (n === 1) {
    if (narrow.matches) openSheet();
    showCoach(rail, 'Your notes, most important first', h('div', null, h('p', null, 'Each kind of problem has its own line in your essay:'), keyList(true)), [next(2), skip], '1 of 3', 'left');
  } else if (n === 2) {
    if (narrow.matches) closeSheet();
    scrollToIssue(first.id, 0.3);
    showCoach(() => [...back.querySelectorAll('.mk')].find(s => (s.dataset.ids || '').split(' ').includes(first.id)), 'Marked where it is',
      h('p', null, 'Click a marked passage, or a note, to open it. A line in the margin joins two passages that contradict each other.'), [next(3), skip], '2 of 3');
  } else {
    setActive(first.id, 'card');
    showCoach(() => rbody.querySelector('.card.on') || rail, 'You decide what changes',
      h('p', null, 'Apply a suggested wording, change the passage yourself, or dismiss the note. Then say whether it was useful: your ratings make the notes better.'),
      [h('button', {class: 'btn sm primary', type: 'button', id: 'coachDone', onclick: () => { closeCoach(); markTour(); }}, 'Got it')], '3 of 3', 'left');
  }
}
// ---- the key to the colours ----
const KEY = [
  ['rel', 'Contradictions and clashes', 'Two passages that can’t both be true, joined in the margin; or a passage your sources or other essays contradict.'],
  ['tension', 'Tension', 'Two passages that only fit together with something you haven’t said.'],
  ['logic', 'Logic', 'A leap, a missing step, or a promise the essay doesn’t keep.'],
  ['evid', 'Evidence', 'A claim that needs a source, or a citation your source doesn’t back up.'],
  ['clar', 'Clarity', 'A sentence that’s hard to follow.'],
  ['gram', 'Grammar', 'A small slip, often with a one-click fix.']];
function keyList(short) {
  return h('ul', {class: 'legend keyl'}, KEY.map(([g, name, desc]) => h('li', null, h('span', {class: 'sw', html: SW[g]}), h('span', null, h('b', null, name), short ? null : ' ' + desc))));
}
function keyEl() {
  return h('section', {class: 'keybox', id: 'keyBox', 'aria-label': 'What the lines mean'},
    h('div', {class: 'khead'}, h('b', null, 'What the lines mean'), h('button', {class: 'x', type: 'button', 'aria-label': 'Close the key', onclick: () => { st.showKey = false; renderRail(); const b = $('#keyBtn'); if (b) b.focus(); }}, '×')),
    keyList(false),
    h('p', {class: 'smeta'}, h('b', null, 'High'), ' marks the notes to fix first. Notes you’ve dealt with move to the bottom.'));
}
