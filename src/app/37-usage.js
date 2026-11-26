// ---- usage: counts of what each tester uses, so Throughline can be priced fairly ----
// Every call to Claude goes through askClaude(), which counts the feature, the tier, how much text went each way
// (as a number of characters), how long it took and how it ended: never any text. Notes count too: how many each
// review shows, which ones the writer rates useful or not, fixes or dismisses. The counts collect per day in this
// browser and go, a few seconds later, into the tester's own record at feedback/<their id> (beside what they sent
// with Send feedback), which only the owner can read. Testers are told first, in the welcome, and can switch it off
// in Privacy and your data; then nothing is counted and their counts are deleted. The owner's own use is counted
// too, marked as theirs.
let uDelta = null, uTimer = 0, uChain = Promise.resolve();
const utcDay = () => new Date().toISOString().slice(0, 10);

// Whether this person has been told and has left counting on. Kept in their own private space ('settings').
const trackPrefs = () => st.settings || {track: true, told: 0};
const usageOn = () => st.store === 'db' && !!dbApi && !!myId && !st.usageOff && trackPrefs().track && (trackPrefs().told > 0 || st.isOwner);
function cleanSettings(x) { const r = plainObj(x); return r.kind === 'settings' ? {track: r.track !== false, told: num(r.told, 0)} : null; }
SPECIAL.settings = {load: x => { st.settings = x ? cleanSettings(x) : null; },
  out: () => st.settings ? {kind: 'settings', v: 1, track: st.settings.track, told: st.settings.told} : null, render: () => {}};
async function setTracking(on, told) {
  st.settings = {track: !!on, told: told || trackPrefs().told || Date.now()};
  try { await saveSpecial('settings'); } catch (e) {}
  if (!on) {
    clearTimeout(uTimer); uDelta = null;
    // Switching it off deletes what has been counted so far (and the record, if it held nothing else).
    if (dbApi && myId) { try { await mineWrite(raw => { if (!raw) return undefined; const f = cleanFeedback(raw); return f && f.items.length ? mineRecord(f.items, raw, null) : null; }); } catch (e) {} }
  }
}

// ---- counting ----
function uDay() {
  if (!uDelta) uDelta = {days: {}, errs: []};
  const k = utcDay();
  return uDelta.days[k] || (uDelta.days[k] = {f: {}, q: {}, e: {}});
}
const bump = (o, k, by) => { o[k] = (hasOwn(o, k) ? o[k] : 0) + (by == null ? 1 : Math.round(by)); };
function failKind(e) {
  const c = e && e.code;
  if (c === 'cancelled') return 'cancelled';
  if (c === 'rate_limited') return e.reason === 'usage_limit' ? 'limit' : 'busy';
  if (c === 'timeout' || c === 'deadline_exceeded') return 'timeout';
  if (isHard(e) || c === 'session_expired') return 'denied';
  if (['invalid_json', 'empty_completion', 'refused', 'bad_output'].includes(c)) return 'unusable';
  return 'error';
}
function countCall(feature, tier, onSample, sent, back, ms, how) {
  if (!usageOn() || !USAGE_FEATURES.includes(feature)) return;
  const D = uDay(), f = hasOwn(D.f, feature) ? D.f[feature] : (D.f[feature] = {});
  bump(f, 'n');
  if (how === 'ok') { bump(f, 'ok'); bump(f, 'ms', ms); }
  // A call refused before it reached Claude (a limit, too busy, not allowed) sent nothing.
  if (!['limit', 'busy', 'denied'].includes(how)) { bump(f, 'i', sent); bump(f, 'o', back); }
  if (onSample) bump(f, 's');
  bump(f.t || (f.t = {}), USAGE_TIERS.includes(tier) ? tier : 'default');
  if (how !== 'ok') bump(f.x || (f.x = {}), how);
  scheduleUsage();
}
// Notes: s shown, u useful, d not useful (w: why), f fixed, x dismissed. by is -1 to take one back.
const countsNotes = d => !!d && !d.isSample && !sampleCopy(d) && !!d.review && d.review.tier !== 'sample';
function usageNote(type, field, by, why) {
  if (!usageOn() || !hasOwn(TYPES, type) || !NOTE_FIELDS.includes(field)) return;
  const D = uDay(), q = hasOwn(D.q, type) ? D.q[type] : (D.q[type] = {});
  bump(q, field, by == null ? 1 : by);
  if (why && NOTE_WHY.includes(why)) bump(q.w || (q.w = {}), why, by == null ? 1 : by);
  scheduleUsage();
}
// Page errors and failed saves: counts, with the error's kind and place in the code (never its message, which could
// quote an essay).
function usageErr(kind, name, line, col) {
  if (!usageOn()) return;
  bump(uDay().e, kind === 'save' ? 'save' : 'js');
  const n = typeof name === 'string' && /^[A-Za-z][A-Za-z0-9:_ -]{0,39}$/.test(name) ? name : 'Error';
  uDelta.errs.push({at: Date.now(), n: (kind === 'save' ? 'Save ' : '') + n, l: Number.isInteger(line) && line >= 0 ? line : 0, c: Number.isInteger(col) && col >= 0 ? col : 0});
  uDelta.errs = uDelta.errs.slice(-10);
  scheduleUsage();
}
addEventListener('error', e => { if (e && (e.error || e.message)) usageErr('js', e.error && e.error.name, e.lineno, e.colno); });
addEventListener('unhandledrejection', e => {
  const r = e && e.reason;
  usageErr('js', r && typeof r.name === 'string' ? r.name : r && typeof r.code === 'string' ? 'Rejected ' + r.code : 'Rejected', 0, 0);
});

// ---- writing: a few seconds after the last count, added to whatever the record holds (another device may have
// counted too), one write at a time ----
function scheduleUsage() { clearTimeout(uTimer); uTimer = setTimeout(flushUsage, 5000); }
function flushUsage() {
  clearTimeout(uTimer);
  if (!uDelta || !usageOn()) return uChain.catch(() => {});
  const delta = uDelta; uDelta = null;
  return mineWrite(raw => {
    const f = raw ? cleanFeedback(raw) : null, cur = raw && raw.usage ? cleanUsage(raw.usage, Object.keys(TYPES)) : null;
    const u = usageMerge(cur, delta, utcDay(), {name: myName, own: st.isOwner, at: Date.now()});
    // The record holds feedback too: if it ever grows too big, the oldest days roll into the total early.
    let out = mineRecord(f ? f.items : [], null, u);
    for (let k = Object.keys(u.days).sort(); bytes(JSON.stringify(out)) > 240000 && k.length > 35; k = k.slice(1)) {
      usageAddDay(u.old, u.days[k[0]]); delete u.days[k[0]]; out = mineRecord(f ? f.items : [], null, u);
    }
    return out;
  }).catch(e => {
    // Not allowed here: stop counting. Anything else: keep the counts for the next try.
    if (e && ['permission_denied', 'not_granted', 'unauthenticated', 'invalid_argument', 'revoked'].includes(e.code)) { st.usageOff = true; return; }
    if (!uDelta) uDelta = {days: {}, errs: []};
    for (const k of Object.keys(delta.days)) usageAddDay(hasOwn(uDelta.days, k) ? uDelta.days[k] : (uDelta.days[k] = {f: {}, q: {}, e: {}}), delta.days[k]);
    uDelta.errs = delta.errs.concat(uDelta.errs).slice(-10);
  });
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushUsage(); });

// ---- every call to Claude: counted, then checked ----
// check(raw) turns Claude's answer into what the feature needs; if it throws (or the call fails), the call counts as
// failed, and the error goes on to the feature as before.
async function askClaude(feature, doc, input, opts, check) {
  const t0 = performance.now(), o = Object.assign({}, opts || {}), theirs = o.onText;
  const sent = typeof input === 'string' ? input.length : Array.isArray(input) ? input.reduce((s, m) => s + String(m && m.content || '').length, 0) : 0;
  const tier = o.modelTier || 'default', onSample = !!(doc && (doc.isSample || sampleCopy(doc)));
  let back = 0, raw;
  if (theirs) o.onText = x => { if (x && typeof x.text === 'string') back = x.text.length; theirs(x); };
  try { raw = await sampleFn.json(input, o); }
  catch (e) {
    if (!back && e && typeof e.text === 'string') back = e.text.length;
    countCall(feature, tier, onSample, sent, back, performance.now() - t0, failKind(e));
    throw e;
  }
  if (!back) { try { back = JSON.stringify(raw).length; } catch (e) {} }
  let v = raw;
  if (check) { try { v = check(raw); } catch (e) { countCall(feature, tier, onSample, sent, back, performance.now() - t0, 'unusable'); throw e; } }
  countCall(feature, tier, onSample, sent, back, performance.now() - t0, 'ok');
  return v;
}

// ---- telling testers ----
// New testers read it in the welcome; testers who saw the welcome before counting began get this, once.
function maybeTellUsage() {
  if (st.isOwner || st.store !== 'db' || !dbApi || !myId || trackPrefs().told || !dlgEl.hidden) return false;
  openDlg('Something new: usage counts',
    h('p', {class: 'wlead'}, 'To work out what Throughline should cost, it now counts what you use.'),
    usageWhat(),
    h('div', {class: 'wacts'},
      h('button', {class: 'btn primary', type: 'button', id: 'usageOk', onclick: () => { setTracking(true); closeDlg(); }}, 'OK'),
      h('button', {class: 'btn', type: 'button', id: 'usageNo', onclick: () => { setTracking(false); closeDlg(); toast('Usage counts are off.'); }}, 'Switch it off')));
  return true;
}
function usageWhat() {
  return h('ul', {class: 'wlist'},
    h('li', null, h('b', null, 'What’s counted: '), 'which features you use, how much text goes to Claude and comes back (as a number of characters), how long it takes, when something fails, and your ratings of notes.'),
    h('li', null, h('b', null, 'Never your writing. '), 'No essay, source, note or answer leaves your own space this way.'),
    h('li', null, h('b', null, 'Who sees it: '), 'only whoever shared Throughline with you, with your name.'),
    h('li', null, h('b', null, 'Your choice. '), 'Switch it off any time in ', h('b', null, 'Privacy and your data'), ', in the essay menu. That deletes what has been counted.'));
}

// ---- rating notes: useful or not, and why not ----
const RATE_WHY = [['wrong', 'Wrong'], ['minor', 'Doesn’t matter'], ['unclear', 'Hard to follow'], ['repeat', 'Repeats another note']];
const RATE_VALUES = ['up', 'down'].concat(RATE_WHY.map(([k]) => 'down:' + k));
const rateOf = (d, id) => d.rates && hasOwn(d.rates, id) ? d.rates[id] : null;
function countRate(type, r, by) {
  if (!r) return;
  const [v, why] = r.split(':');
  usageNote(type, v === 'up' ? 'u' : 'd', by, v === 'down' ? why : null);
}
function rateIssue(is, v, why) {
  const d = st.cur.isSample ? st.cur : ensureReal(st.cur), prev = rateOf(d, is.id);
  let next = why ? 'down:' + why : v;
  if (!why && prev && prev.split(':')[0] === v) next = null;   // the same thumb again takes the rating back
  else if (why && prev === next) next = 'down';                 // the same reason again takes back just the reason
  const rates = d.rates || (d.rates = Object.create(null));
  if (next) rates[is.id] = next; else delete rates[is.id];
  if (countsNotes(d)) { countRate(is.type, prev, -1); countRate(is.type, next, 1); }
  if (!d.isSample) { d.updatedAt = Date.now(); persist(d); }
  renderRail();
  const b = rbody.querySelector('[data-rate="' + (why ? 'why-' + why : v) + '"]');
  if (b) b.focus({preventScroll: true});
}
function rateEl(is) {
  const r = rateOf(st.cur, is.id), v = r ? r.split(':')[0] : null, why = r ? r.split(':')[1] || null : null;
  const thumb = (k, label, path) => h('button', {class: 'rbtn', type: 'button', 'aria-pressed': String(v === k), 'aria-label': label, title: label, data: {rate: k},
    onclick: () => rateIssue(is, k), html: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="' + path + '" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>'});
  return h('div', {class: 'rate'},
    h('div', {class: 'rrow', role: 'group', 'aria-label': 'Was this note useful?'},
      h('span', {class: 'rlbl'}, 'Useful?'),
      thumb('up', 'Useful', 'M5 7.5V13H3V7.5zM5 7.5 7.6 2.6c.9 0 1.6.7 1.5 1.6L8.8 6.5h3.3c.8 0 1.4.8 1.2 1.6l-1 4c-.2.6-.7.9-1.3.9H5'),
      thumb('down', 'Not useful', 'M5 8.5V3H3v5.5zM5 8.5l2.6 4.9c.9 0 1.6-.7 1.5-1.6L8.8 9.5h3.3c.8 0 1.4-.8 1.2-1.6l-1-4c-.2-.6-.7-.9-1.3-.9H5'),
      v ? h('span', {class: 'rthanks', 'aria-live': 'polite'}, v === 'up' ? 'Thanks' : why ? 'Thanks' : 'What was wrong with it?') : null),
    v === 'down' ? h('div', {class: 'rwhy', role: 'group', 'aria-label': 'Why wasn’t it useful?'},
      RATE_WHY.map(([k, label]) => h('button', {class: 'chip', type: 'button', 'aria-pressed': String(why === k), data: {rate: 'why-' + k}, onclick: () => rateIssue(is, 'down', k)}, label))) : null);
}
// What the next review shows that the last one didn't (shown), and what it no longer finds that you didn't apply
// (fixed by your own edits; applied suggestions count when you apply them).
function countReviewNotes(d) {
  if (!countsNotes(d) || !d.history) return;
  const L = d.history.list, cur = L[L.length - 1], prev = L.length > 1 ? L[L.length - 2] : null;
  if (!cur) return;
  const c = prev ? compareNotes(prev.notes, cur.notes) : {fixed: [], added: cur.notes};
  for (const x of c.added) usageNote(x.t, 's');
  for (const x of c.fixed) if (x.m !== 'applied') usageNote(x.t, 'f');
}
