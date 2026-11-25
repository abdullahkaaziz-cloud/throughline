// ---- consistent terms ----
// Each term written one way. The writer's terms (the "terms" record beside the documents) hold the form to keep and
// other words for it, and apply in every essay: other ways of writing a kept form, and the other words, are marked
// in blue as the writer types. The Terms tab also lists terms written more than one way, found on the device, and,
// when the writer asks, different words for one idea, found by Claude. The essay changes only when the writer asks.
Object.assign(st, {termRules: null, termVer: 0, termRun: null, termErr: null, termCur: null, termHi: null, termPick: new Map(), termAdd: false, termAll: false});
const TC = {text: null, tokens: [], groups: null, mtext: null, marks: null, ver: -1, ix: null, paras: new Map()};
function termToks() {
  const t = ed.value;
  if (TC.text !== t) { TC.text = t; TC.tokens = termTokens(t); TC.groups = null; }
  return TC.tokens;
}
const termList = () => st.termRules ? st.termRules.rules : [];
const termRuleOf = m => termList()[m.ri];
// The places in this essay that don't match the writer's terms. Run on every keystroke, so each paragraph is read
// once and remembered: a term never runs across a line break.
function termMarks() {
  if (!st.cur || st.cur.role === 'source' || !termList().length) return [];
  const text = ed.value;
  if (TC.ver !== st.termVer) { TC.ver = st.termVer; TC.ix = termIndex(termList()); TC.paras.clear(); TC.mtext = null; }
  if (TC.mtext === text) return TC.marks;
  const out = [];
  let p = 0;
  for (const line of text.split('\n')) {
    if (line.trim()) {
      let ms = TC.paras.get(line);
      if (!ms) { ms = termMatches(line, termTokens(line), termList(), TC.ix); TC.paras.set(line, ms); }
      for (const m of ms) out.push(Object.assign({}, m, {s: m.s + p, e: m.e + p}));
    }
    p += line.length + 1;
  }
  if (TC.paras.size > 3000) TC.paras.clear();
  TC.mtext = text; TC.marks = out;
  return out;
}
// Terms written more than one way that the writer hasn't decided on: Claude's groups first (checked against the text
// as it is now), then spellings found on the device. A group goes once the writer keeps a form or says they differ.
function foundGroups() {
  const d = st.cur; if (!d || d.role === 'source') return [];
  const toks = termToks(), text = TC.text, apart = new Set(st.termRules ? st.termRules.apart : []);
  const covered = new Set(termList().flatMap(r => [r.keep, ...r.forms].map(termKey))), out = [], taken = new Set();
  if (d.terms && d.terms.groups.length) for (const g of validateTerms({groups: d.terms.groups}, text, toks, 12)) {
    const keys = [...new Set(g.ways.map(w => w.k))], sig = keys.slice().sort().join('|');
    keys.forEach(k => taken.add(k));
    if (apart.has(sig) || keys.every(k => covered.has(k))) continue;
    out.push({sig, kind: 'word', label: g.label, keep: g.keep, ways: g.ways});
  }
  if (!TC.groups) TC.groups = termGroups(text, toks, 12);
  for (const g of TC.groups) {
    if (taken.has(g.key) || apart.has(g.key) || covered.has(g.key)) continue;
    out.push({sig: g.key, kind: g.open ? 'open' : 'spell', label: '', keep: g.ways[0].t, ways: g.ways.map(w => Object.assign({k: g.key}, w))});
  }
  return out;
}

// ---- the writer's terms, kept beside the documents ----
function termsRecord() { return {kind: 'terms', v: 1, rules: st.termRules.rules, apart: st.termRules.apart}; }
SPECIAL.terms = {load: x => { st.termRules = x ? cleanTermRules(x) : null; st.termVer++; },
  out: () => st.termRules ? termsRecord() : null,
  render: () => { if (!st.cur) return; renderBackdrop(); if (st.view === 'terms') renderTerms(); updateTermCount(); }};
async function saveTerms() { try { await saveSpecial('terms'); } catch (e) { toast('Couldn’t save your terms. They stay until you reload.'); } }
function termsChanged() {
  st.termVer++; st.termCur = null; st.termHi = null;
  renderBackdrop(); if (st.view === 'terms') renderTerms(); updateTermCount();
  saveTerms();
}
// Keep `keep` from now on, instead of `forms`. A rule that shares any of these terms is folded in, its kept form
// becoming one of the forms to change, so each term lives in one rule.
function addRule(keep, forms, label) {
  keep = termText(keep);
  if (!keep) { toast('A term is one to four words.'); return; }
  const R = st.termRules || (st.termRules = {rules: [], apart: []});
  const K = termKey(keep), keys = new Set([K, ...forms.map(termKey)]), merged = [];
  let lab = label || '';
  R.rules = R.rules.filter(r => {
    if (![r.keep, ...r.forms].some(f => keys.has(termKey(f)))) return true;
    if (termKey(r.keep) !== K) merged.push(r.keep);
    merged.push(...r.forms); if (!lab) lab = r.label;
    return false;
  });
  const all = [], seen = new Set([K]);
  for (const f of [...forms, ...merged]) { const t = termText(f), fk = termKey(t); if (t && !seen.has(fk)) { seen.add(fk); all.push(t); } }
  R.rules.unshift({id: newId(), keep, forms: all.slice(0, 12), label: clip(lab, 50)});
  R.rules = R.rules.slice(0, 100);
  termsChanged();
}
function removeRule(id) {
  const R = st.termRules, r = R && R.rules.find(x => x.id === id); if (!r) return;
  R.rules = R.rules.filter(x => x !== r);
  termsChanged();
  toast('Stopped checking “' + trunc(r.keep, 40) + '”.');
}

// ---- the tab ----
let termT = 0;
function updateTermCount() {
  clearTimeout(termT); termT = 0;
  const el = $('#tcount'); if (!el || !st.cur) return;
  const n = st.cur.role === 'source' ? 0 : termMarks().length + foundGroups().length;
  el.textContent = n ? String(n) : '';
}
// After typing stops: the count, and the open tab unless the writer is busy in it.
function scheduleTerms() {
  clearTimeout(termT);
  termT = setTimeout(() => { updateTermCount(); if (st.view === 'terms' && !rail.contains(document.activeElement)) renderTerms(); }, 400);
}
function renderTerms() {
  const d = st.cur, keep = rbody.scrollTop;
  if (d.role === 'source') {
    fill(rbody, h('section', {class: 'empty'}, h('h3', null, 'Terms'), h('p', null, 'Terms are checked in your essays. A source stays as its author wrote it.')));
    return;
  }
  const marks = termMarks(), found = foundGroups(), rules = termList(), kids = [], by = new Map();
  if (st.termRun && st.termRun.doc === d) kids.push(termProgressEl());
  if (st.termErr && st.termErr.doc === d) kids.push(h('section', {class: 'errc', role: 'alert'}, h('b', null, 'The check didn’t finish'),
    h('p', null, errText(st.termErr.err)), isHard(st.termErr.err) ? null : h('button', {class: 'btn sm', type: 'button', onclick: runTerms}, 'Try again')));
  for (const m of marks) { let a = by.get(m.ri); if (!a) by.set(m.ri, a = []); a.push(m); }
  if (by.size) kids.push(h('h3', {class: 'tmsec'}, 'Your terms, written another way'), [...by].map(([ri, ms]) => termRuleCard(rules[ri], ms)));
  if (found.length) kids.push(h('h3', {class: 'tmsec'}, 'Written more than one way'), found.map(termFoundCard));
  if (!by.size && !found.length && !(st.termRun && st.termRun.doc === d)) kids.push(rules.length
    ? h('section', {class: 'empty'}, h('h3', null, 'Each term is written one way'), h('p', null, 'Your terms are written as you keep them, and nothing else is written two ways.'))
    : h('section', {class: 'empty'}, h('h3', null, 'Write each term one way'),
      h('p', null, 'Throughline looks for terms you’ve written more than one way, like “e-mail” and “email”. Choose the way to keep, and the others are marked in blue as you write.')));
  kids.push(termFindEl(d), termAddEl(), termAllEl());
  fill(rbody, kids);
  rbody.scrollTop = keep;
}
// A term the writer keeps, with the ways this essay writes it otherwise. Other spellings change in one go; other
// words are shown one at a time, for the writer to rewrite or replace.
function termRuleCard(r, ms) {
  const ways = termWays(ms), spell = ms.filter(m => m.how === 'spell');
  const cur = st.termCur && ms.find(m => m.s === st.termCur[0] && m.e === st.termCur[1]);
  return h('section', {class: 'tmcard' + (cur ? ' on' : ''), data: {rule: r.id}},
    h('div', {class: 'tmhead'}, h('span', {class: 'tmkeep'}, r.keep), r.label ? h('span', {class: 'tmlabel'}, r.label) : null),
    h('p', {class: 'tmsub'}, ms.length === 1 ? 'Written another way once:' : 'Written another way ' + ms.length + ' times:'),
    h('div', {class: 'tmways'}, ways.map(w => h('button', {class: 'tmway', type: 'button', title: 'Show where you wrote this',
      onclick: () => termShowNext(r.id, w.t)}, h('span', {class: 'tmw'}, w.t), h('span', {class: 'n', 'aria-label': plural(w.n, 'time')}, w.n)))),
    cur ? termCurEl(r, cur) : null,
    h('div', {class: 'tmact'},
      spell.length ? h('button', {class: 'btn sm primary', type: 'button', onclick: () => termChangeAll(r.id)},
        (spell.length === ms.length ? (spell.length === 1 ? 'Change it' : 'Change all ' + spell.length) : 'Change ' + plural(spell.length, 'spelling')) + ' to “' + trunc(r.keep, 24) + '”') : null,
      h('button', {class: 'btn sm', type: 'button', onclick: () => termShowNext(r.id)}, cur ? 'Next' : 'Show me')));
}
// The place being looked at, in its sentence, with a way to put the kept form there.
function termCurEl(r, m) {
  const text = ed.value, ps = text.lastIndexOf('\n', m.s - 1) + 1, pe0 = text.indexOf('\n', m.e), pe = pe0 < 0 ? text.length : pe0;
  let a = Math.max(ps, m.s - 70), b = Math.min(pe, m.e + 70);
  if (a > ps) { const sp = text.indexOf(' ', a); if (sp >= 0 && sp < m.s) a = sp + 1; }
  if (b < pe) { const sp = text.lastIndexOf(' ', b); if (sp > m.e) b = sp; }
  return h('div', {class: 'tmcur'},
    h('p', {class: 'tmctx'}, (a > ps ? '…' : '') + text.slice(a, m.s), h('mark', null, text.slice(m.s, m.e)), text.slice(m.e, b) + (b < pe ? '…' : '')),
    h('div', {class: 'tmact'}, h('button', {class: 'btn sm', type: 'button', onclick: () => termReplaceOne(r.id, m.s, m.e)}, 'Replace with “' + trunc(m.fix, 28) + '”'),
      m.how === 'word' ? h('span', {class: 'tmnote'}, 'Or rewrite it in the essay.') : null));
}
// Where a term isn't written as kept: the next place after the one in view, for one way of writing it or for all.
function termShowNext(id, way) {
  const all = termMarks().filter(m => termRuleOf(m).id === id);
  const list = way == null ? all : (termWays(all).find(w => w.t === way) || {occ: []}).occ;
  if (!list.length) return;
  const at = st.termCur ? st.termCur[0] : -1, nx = list.find(o => o.s > at) || list[0];
  st.termCur = [nx.s, nx.e]; st.termHi = null;
  renderBackdrop(); renderTerms();
  scrollToRange(st.termCur, narrow.matches ? 0.12 : 0.35);
  requestAnimationFrame(() => { const c = rbody.querySelector('[data-rule="' + CSS.escape(id) + '"]'); if (c) c.scrollIntoView({block: 'nearest', behavior: reduce ? 'auto' : 'smooth'}); });
}
function termUndoHint() { return (mac ? '⌘Z' : 'Ctrl+Z') + ' undoes it.'; }
// Other spellings of the kept form, all changed in one edit (one undo), from the marks as they are now.
function termChangeAll(id) {
  const reps = termMarks().filter(m => m.how === 'spell' && termRuleOf(m).id === id).map(m => ({s: m.s, e: m.e, t: m.fix}));
  if (!reps.length) return;
  const r = termList().find(x => x.id === id), text = ed.value, s0 = reps[0].s, e0 = reps[reps.length - 1].e;
  let out = '', p = s0;
  for (const x of reps) { out += text.slice(p, x.s) + x.t; p = x.e; }
  out += text.slice(p, e0);
  const y = scrollY, c0 = ed.selectionStart, c1 = ed.selectionEnd, grow = out.length - (e0 - s0), fit = c => c <= s0 ? c : c >= e0 ? c + grow : s0 + out.length;
  appEdit('other', reps.map(x => x.t).join(''), () => replaceRange(s0, e0, out, true));
  ed.setSelectionRange(fit(c0), fit(c1));
  window.scrollTo(0, y);
  toast('Changed ' + plural(reps.length, 'place') + ' to “' + trunc(r.keep, 30) + '”. ' + termUndoHint());
  renderBackdrop(); if (st.view === 'terms') renderTerms(); updateTermCount();
}
// Put the kept form in one place, then move on to the next place for the same term.
function termReplaceOne(id, s, e) {
  const m = termMarks().find(x => x.s === s && x.e === e && termRuleOf(x).id === id);
  if (!m) { toast('That passage has changed.'); renderTerms(); return; }
  appEdit('other', m.fix, () => replaceRange(m.s, m.e, m.fix, true));
  const rest = termMarks().filter(x => termRuleOf(x).id === id), nx = rest.find(x => x.s >= m.s + m.fix.length) || rest[0];
  st.termCur = nx ? [nx.s, nx.e] : null;
  renderBackdrop(); renderTerms(); updateTermCount();
  if (nx) scrollToRange(st.termCur, narrow.matches ? 0.12 : 0.35);
  toast(nx ? 'Replaced. ' + termUndoHint() : 'Every place now says “' + trunc(m.fix, 30) + '”. ' + termUndoHint());
}
// A term this essay writes in different ways: the writer picks the one to keep, or says they're different things.
function termPickOf(g) {
  const p = st.termPick.get(g.sig); if (p && g.ways.some(w => w.t === p)) return p;
  const want = [...termList().map(r => r.keep), g.keep];   // a form the writer already keeps, then Claude's choice
  for (const t of want) { const w = g.ways.find(x => termForm(x.t) === termForm(t)); if (w) return w.t; }
  for (const t of want) { const w = g.ways.find(x => x.k === termKey(t)); if (w) return w.t; }
  return g.ways[0].t;
}
function termFoundCard(g, i) {
  const pick = termPickOf(g), name = 'tpick' + i;
  const btn = h('button', {class: 'btn sm primary', type: 'button', onclick: () => termKeepGroup(g.sig)}, 'Keep “' + trunc(pick, 24) + '”');
  const rows = g.ways.map(w => h('label', {class: 'tmrow', onmouseenter: () => termHiWay(g.sig, w.t), onmouseleave: () => termHiWay(null)},
    h('input', {type: 'radio', name, value: w.t, checked: w.t === pick || null, onchange: () => {
      st.termPick.set(g.sig, w.t); btn.textContent = 'Keep “' + trunc(w.t, 24) + '”'; termShowWay(g.sig, w.t); }}),
    h('span', {class: 'tmw'}, w.t), h('span', {class: 'n', 'aria-label': plural(w.n, 'time')}, w.n)));
  const words = new Set(g.ways.map(w => w.k)).size > 1;
  return h('section', {class: 'tmcard', data: {sig: g.sig}},
    g.label ? h('p', {class: 'tmkind'}, g.label + (words ? ' · different words' : '')) : null,
    h('div', {class: 'tmrows', role: 'radiogroup', 'aria-label': 'Which to keep'}, rows),
    g.kind === 'open' ? h('p', {class: 'tmnote'}, 'Sometimes both are right: “a long-term plan”, but “in the long term”.') : null,
    h('div', {class: 'tmact'}, btn, h('button', {class: 'btn sm ghost', type: 'button', title: 'They’re different, or both are right', onclick: () => termKeepApart(g.sig)}, g.ways.length > 2 ? 'Keep all' : 'Keep both')));
}
const termWayOf = (sig, t) => { const g = foundGroups().find(x => x.sig === sig); return g && g.ways.find(w => w.t === t); };
function termHiWay(sig, t) {
  const w = sig && termWayOf(sig, t);
  st.termHi = w ? w.occ.map(o => [o.s, o.e]) : null;
  renderBackdrop();
}
function termShowWay(sig, t) {
  const w = termWayOf(sig, t); if (!w) return;
  const at = st.termCur ? st.termCur[0] : -1, nx = w.occ.find(o => o.s > at) || w.occ[0];
  st.termCur = [nx.s, nx.e]; renderBackdrop();
  scrollToRange(st.termCur, narrow.matches ? 0.12 : 0.35);
}
function termKeepGroup(sig) {
  const g = foundGroups().find(x => x.sig === sig); if (!g) return;
  const pick = termPickOf(g), k = termKey(pick), forms = [];
  for (const w of g.ways) if (w.k !== k && !forms.some(f => termKey(f) === w.k)) forms.push(w.t);
  addRule(pick, forms, g.label);
  const n = termMarks().filter(m => termKey(termRuleOf(m).keep) === k).length;
  toast('Keeping “' + trunc(pick, 30) + '”' + (n ? '. ' + plural(n, 'place') + ' to change, marked in blue.' : '.'));
}
function termKeepApart(sig) {
  const R = st.termRules || (st.termRules = {rules: [], apart: []});
  if (!R.apart.includes(sig)) R.apart = R.apart.concat(sig).slice(-300);
  termsChanged();
  toast('Left as they are.');
}

// ---- different words for one idea: asked of Claude only when the writer presses the button ----
function termPrompt(d, text) {
  return TERM_RULES.replace('{n}', '8') + '\n\nESSAY TITLE: ' + docLabel(d) + '\n\nESSAY:\n<essay>\n' + fence(text) + '\n</essay>';
}
async function runTerms() {
  const d = st.cur; if (st.termRun || !d || d.role === 'source') return;
  const text = ed.value;
  if (words(text) < 30) { toast('Write a little more first.'); return; }
  if (st.ai === 'pending') await capsReady;
  if (!sampleFn || st.ai !== 'ready') { toast(st.aiWhy || 'AI isn’t available in this view.'); return; }
  const prompt = termPrompt(d, text), tier = pickTier();
  st.termErr = null;
  if (bytes(prompt) > LIMITS.promptBytes) { st.termErr = {doc: d, err: {code: 'prompt_too_large'}}; renderTerms(); return; }
  const R = st.termRun = {doc: d, ctl: new AbortController(), t0: Date.now()};
  if (st.view === 'terms') renderTerms();
  const tick = setInterval(() => { const b = $('#ttime'); if (b) b.textContent = termTime(); }, 1000);
  try {
    const opts = {signal: R.ctl.signal}; if (tier) opts.modelTier = tier;
    const raw = await sampleFn.json(prompt, opts);
    const groups = validateTerms(raw, text, termTokens(text), 8);
    const e = ensureReal(d);
    e.terms = {sig: hash(text), at: Date.now(), groups: groups.map(g => ({label: g.label, keep: g.keep, forms: g.forms}))};
    e.updatedAt = Date.now(); persist(e, 0);
    toast(groups.length ? 'Found ' + plural(groups.length, 'term') + ' written more than one way.' : 'No idea goes by two names here.');
  } catch (err) {
    if (!(err && err.code === 'cancelled')) { st.termErr = {doc: d, err}; noteAiError(err); }
  } finally {
    clearInterval(tick); st.termRun = null;
    if (st.cur === d) { if (st.view === 'terms') renderTerms(); updateTermCount(); }
  }
}
function termTime() { const R = st.termRun; if (!R) return ''; const s = Math.floor((Date.now() - R.t0) / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function termProgressEl() {
  return h('section', {class: 'prog', 'aria-live': 'polite'}, h('div', {class: 'pbar'}, h('i')),
    h('div', {class: 'ptxt'}, h('b', null, 'Reading for terms…'), h('span', {id: 'ttime'}, termTime())),
    h('button', {class: 'btn sm', type: 'button', onclick: () => { if (st.termRun) st.termRun.ctl.abort(); }}, 'Stop'));
}
function termFindEl(d) {
  const c = d.terms, off = st.ai === 'denied' || st.ai === 'off', fresh = c && c.sig === hash(ed.value);
  return h('section', {class: 'tmfind'},
    h('h3', {class: 'tmsec'}, 'Different words, one idea'),
    h('p', null, !c ? 'Claude can look for ideas you’ve given more than one name, like “remote work” and “working from home”, which a reader may take for different things.'
      : 'Checked ' + ago(c.at) + (fresh ? (c.groups.length ? '.' : ': each idea has one name.') : ', before your latest changes.')),
    off ? h('p', {class: 'tmnote'}, st.aiWhy || 'AI isn’t available in this view.')
      : h('button', {class: 'btn sm', type: 'button', disabled: st.termRun ? true : null, onclick: runTerms}, c ? 'Check again' : 'Find them'));
}
// ---- adding and listing terms ----
function termAddEl() {
  const keep = h('input', {type: 'text', id: 'tKeep', maxlength: 60, autocomplete: 'off', spellcheck: 'false', placeholder: 'remote work'});
  const forms = h('input', {type: 'text', id: 'tForms', maxlength: 300, autocomplete: 'off', spellcheck: 'false', placeholder: 'working from home, telework'});
  const go = e => {
    e.preventDefault();
    const k = termText(keep.value);
    if (!k) { toast('Write the form to keep, in one to four words.'); keep.focus(); return; }
    const fs = forms.value.split(/[,;\n]/).map(termText).filter(Boolean);
    st.termAdd = false; addRule(k, fs, '');
    toast('Keeping “' + trunc(k, 30) + '” in every essay.');
  };
  return h('details', {class: 'tmadd', open: st.termAdd || null, ontoggle: e => { st.termAdd = e.currentTarget.open; }},
    h('summary', null, 'Add a term'),
    h('form', {onsubmit: go},
      h('label', null, 'Always write', keep),
      h('label', null, 'Instead of', forms),
      h('p', {class: 'tmnote'}, 'Separate other words with commas. Other spellings of the first are found anyway.'),
      h('button', {class: 'btn sm primary', type: 'submit'}, 'Add')));
}
function termAllEl() {
  const R = st.termRules, rules = termList(), apart = R ? R.apart.length : 0;
  if (!rules.length && !apart) return null;
  return h('details', {class: 'tmall', open: st.termAll || null, ontoggle: e => { st.termAll = e.currentTarget.open; }},
    h('summary', null, 'Your terms', rules.length ? h('span', {class: 'n'}, ' · ' + rules.length) : null),
    h('p', {class: 'tmnote'}, 'Checked in every essay you write here.'),
    rules.length ? h('ul', null, rules.map(r => h('li', null, h('span', {class: 'tmkeep'}, r.keep),
      h('span', {class: 'tminst'}, r.forms.length ? 'instead of ' + r.forms.join(', ') : 'in one spelling'),
      h('button', {class: 'lnk danger', type: 'button', 'aria-label': 'Stop checking “' + r.keep + '”', onclick: () => removeRule(r.id)}, 'Remove')))) : null,
    apart ? h('p', {class: 'tmnote'}, plural(apart, 'group') + ' you said are different. ',
      h('button', {class: 'lnk', type: 'button', onclick: () => { R.apart = []; termsChanged(); toast('They’ll be shown again.'); }}, 'Show them again')) : null);
}

// ---- wiring ----
// Editing moves the text under any place in view, so the highlights go; the count catches up when typing stops.
ed.addEventListener('input', () => { st.termCur = null; st.termHi = null; scheduleTerms(); });
// With the Terms tab open, putting the caret in a marked place brings up its term.
function termAtCaret() {
  if (st.view !== 'terms') return;
  const p = ed.selectionStart, m = termMarks().find(x => x.s <= p && p <= x.e);
  if (!m || (st.termCur && st.termCur[0] === m.s && st.termCur[1] === m.e)) return;
  st.termCur = [m.s, m.e]; renderBackdrop(); renderTerms();
  const c = rbody.querySelector('[data-rule="' + CSS.escape(termRuleOf(m).id) + '"]'); if (c) c.scrollIntoView({block: 'nearest'});
}
ed.addEventListener('mouseup', termAtCaret);
// Pointing at a blue place says which term it is.
let termTipRAF = 0, termTipXY = null;
ed.addEventListener('mousemove', e => {
  termTipXY = [e.clientX, e.clientY];
  if (!termTipRAF) termTipRAF = requestAnimationFrame(() => {
    termTipRAF = 0;
    let tip = '';
    for (const el of document.elementsFromPoint(termTipXY[0], termTipXY[1])) if (el.dataset && el.dataset.ts != null) {
      const off = +el.dataset.ts, m = termMarks().find(q => q.s <= off && off < q.e), r = m && termRuleOf(m);
      if (r) tip = 'Your term: “' + r.keep + '”. See the Terms tab.';
      break;
    }
    if (ed.title !== tip) ed.title = tip;
  });
});
ed.addEventListener('keyup', e => { if (/^(Arrow|Home|End|Page)/.test(e.key)) termAtCaret(); });
