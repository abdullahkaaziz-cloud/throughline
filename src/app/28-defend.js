// ---- "Defend it": a viva on your own essay ----
// Claude, as examiner, asks about the essay's weakest points (from the argument map and the review's open notes);
// the writer answers out loud (dictation) or typed; each answer gets a verdict, feedback, at most one follow-up, and
// what the essay itself should change. Sessions are kept on the essay ('defences') for the writing record.
const defEl = $('#defend');
const SESSION_MAX = 8;
const listOf = d => d.defences || (d.defences = []);

// ---- capabilities that make it a spoken viva: read questions aloud, answer by voice ----
async function initVoice() {
  const [t, dc, dl] = await Promise.all([use('tts'), use('dictation'), use('downloads')]);
  st.tts = t || null; st.dl = dl || null; st.dict = dc || null;
  if (st.dict) {
    try {
      // Spoken words go into the viva's answer box, or Grow's in Plan mode.
      const at = () => st.mode === 'plan' ? {box: '#growAns', part: '#growPartial'} : {box: '#vivaAns', part: '#vivaPartial'};
      st.dict.onFinal(({text}) => {
        const box = $(at().box); if (!box || !text) return;
        const v = box.value;
        box.value = (v ? v + (/\s$/.test(v) || /^\s/.test(text) ? '' : ' ') + text : text.replace(/^\s+/, '')).slice(0, 1200);
        if (st.mode === 'plan') st.growDraft = box.value;
        else if (st.viva) { st.viva.spoken = true; st.viva.draft = box.value; }
        const p = $(at().part); if (p) p.textContent = '';
      });
      st.dict.onPartial(({text}) => { const p = $(at().part); if (p) p.textContent = text; });
      st.dict.onState(({state, reason}) => {
        st.dictOn = state !== 'idle';
        if (reason === 'not_granted' || reason === 'unavailable') st.dictBlocked = true;
        for (const b of [$('#vivaMic'), $('#growMic')]) if (b) { b.setAttribute('aria-pressed', String(st.dictOn)); b.lastChild.textContent = st.dictOn ? 'Stop listening' : 'Answer out loud'; b.hidden = !!st.dictBlocked; }
      });
    } catch (e) { st.dict = null; }
  }
  if (st.mode === 'defend') renderDefend();
}
function say(text) { if (st.tts && st.vivaVoice && text) st.tts.speak(String(text).slice(0, 2000), {voice: 'rounded'}).catch(() => {}); }
function hush() { if (st.tts) { try { st.tts.stop(); } catch (e) {} } }
function toggleDictation() {
  const dc = st.dict; if (!dc) return;
  if (dc.active()) { dc.stop().catch(() => {}); return; }
  hush();
  dc.start().catch(err => {
    const c = err && err.code;
    if (c === 'not_granted' || c === 'unavailable') { st.dictBlocked = true; for (const b of [$('#vivaMic'), $('#growMic')]) if (b) b.hidden = true; toast('Speaking isn’t available here. Type your answer instead.'); }
    else if (c !== 'stopped' && c !== 'dismissed') toast('Couldn’t start listening. Try again, or type your answer.');
  });
}
async function stopDictation() { if (st.dict && st.dict.active()) { try { await st.dict.stop(); } catch (e) {} } }

// ---- prompts: the whole essay to set questions; around the passage to judge an answer ----
function weakPoints(d) {
  const out = [], a = d.argmap;
  if (a && argState(d) !== 'moved') for (const p of a.problems) out.push('- (' + p.kind + ') ¶' + p.paras.join(', ¶') + ': ' + p.note);
  if (d.review) for (const is of d.review.issues.filter(x => !(d.marks || {})[x.id] && x.severity !== 'low').slice(0, 10)) out.push('- (' + is.type + ') ' + (is.title || '') + ': "' + clip(is.qa, 200) + '"');
  return out.join('\n');
}
function examPrompt(d, text, n, style) {
  const numbered = textParas(text).map((x, i) => '[' + (i + 1) + '] ' + x).join('\n\n'), notes = weakPoints(d);
  return EXAM_RULES.replace('{n}', String(n)) + '\n\n' + VIVA_STYLE[style].rule + '\n\nESSAY TITLE: ' + docLabel(d) +
    '\n\nESSAY (each paragraph starts with its number in brackets; never include these numbers in a quote):\n<essay>\n' + fence(numbered) + '\n</essay>' +
    (notes ? '\n\nNOTES (weak points found earlier):\n<notes>\n' + fence(notes) + '\n</notes>' : '');
}
// The paragraph a question is about, its neighbours and the opening in full; the rest as first sentences.
function vivaContext(text, para) {
  const ps = textParas(text);
  if (!para && text.length < LIMITS.fullTextChars) return ps.map((x, i) => '[' + (i + 1) + '] ' + x).join('\n\n');
  return ps.map((x, i) => { const n = i + 1; return n === 1 || (para && Math.abs(n - para) <= 1) ? '[' + n + '] ' + x : '[' + n + '] (in short) ' + gist(x); }).join('\n\n');
}
function judgePrompt(d, text, Q, turns, style) {
  const turn = turns[turns.length - 1], earlier = turns.slice(0, -1).map(t => 'Question: ' + t.q + '\nAnswer: ' + (t.a || '(no answer)')).join('\n\n');
  return JUDGE_RULES + '\n\n' + VIVA_STYLE[style].rule + '\n\nESSAY TITLE: ' + docLabel(d) +
    '\n\nESSAY (paragraphs marked "(in short)" show only their first sentence):\n<essay>\n' + fence(vivaContext(text, Q.para)) + '\n</essay>' +
    (earlier ? '\n\nEARLIER IN THIS QUESTION:\n<answer>\n' + fence(earlier) + '\n</answer>' : '') +
    '\n\nQUESTION' + (turns.length > 1 ? ' (a follow-up)' : '') + ':\n<question>\n' + fence(turn.q) + (Q.why ? '\n(A good answer must show: ' + fence(Q.why) + ')' : '') + '\n</question>' +
    '\n\nANSWER:\n<answer>\n' + fence(turn.a || '(no answer)') + '\n</answer>';
}

// ---- the session ----
const curSession = () => st.viva && st.viva.doc === st.cur ? st.viva.s : null;
function openDefend() { st.vivaView = null; setMode('defend'); }
async function aiReady() {
  if (st.ai === 'pending') await capsReady;
  if (!sampleFn || st.ai !== 'ready') { toast(st.aiWhy || 'AI isn’t available in this view.'); return false; }
  return true;
}
async function startViva() {
  const d = st.cur, text = ed.value;
  if (st.viva && st.viva.busy) return;
  if (words(text) < 80) { toast('Write a little more first: a viva needs an essay to defend.'); return; }
  if (!(await aiReady())) return;
  const V = st.viva = {doc: d, s: null, qi: 0, busy: 'ask', err: null, draft: '', pasted: 0, spoken: false, t0: 0};
  renderDefend();
  try {
    const opts = {}, tier = pickTier(); if (tier) opts.modelTier = tier;
    const qs = await askClaude('viva', d, examPrompt(d, text, st.vivaN, st.vivaStyle), opts, raw => { const v = validateExam(raw, text, st.vivaN); if (!v.length) throw {code: 'invalid_json'}; return v; });
    const e = ensureReal(d), s = {id: 'v' + Date.now().toString(36), at: Date.now(), style: st.vivaStyle, done: false, qs: qs.map(q => Object.assign(q, {turns: []}))};
    listOf(e).push(s);
    while (e.defences.length > 12) e.defences.shift();
    V.s = s; V.busy = null; e.updatedAt = Date.now(); persist(e, 0);
    askNext(V);
  } catch (err) {
    V.busy = null; V.err = err; noteAiError(err); renderDefend();
  }
}
// Put the next question (or follow-up) to the writer, out loud when voice is on.
function askNext(V, follow) {
  const Q = V.s.qs[V.qi];
  if (!Q) { finishViva(V); return; }
  if (!follow) Q.turns.push({q: Q.q, a: '', ms: 0, pasted: 0, spoken: false, verdict: null, feedback: '', fix: ''});
  V.draft = ''; V.pasted = 0; V.spoken = false; V.t0 = Date.now();
  renderDefend();
  say(Q.turns[Q.turns.length - 1].q);
  const box = $('#vivaAns'); if (box) box.focus({preventScroll: true});
}
async function submitAnswer() {
  const V = st.viva; if (!V || !V.s || V.busy) return;
  await stopDictation();
  const box = $('#vivaAns'), Q = V.s.qs[V.qi], turn = Q.turns[Q.turns.length - 1], d = V.doc;
  turn.a = clip(box ? box.value : V.draft, 1200);
  if (!turn.a) { toast('Say or type an answer first, or skip the question.'); return; }
  turn.ms = Date.now() - V.t0; turn.pasted = Math.min(V.pasted, turn.a.length); turn.spoken = V.spoken;
  if (!(await aiReady())) return;
  hush(); V.busy = 'judge'; V.err = null; renderDefend();
  try {
    const opts = {}, tier = pickTier(); if (tier) opts.modelTier = tier;
    const j = await askClaude('judge', d, judgePrompt(d, d === st.cur ? ed.value : d.text, Q, Q.turns, V.s.style), opts, raw => { const v = validateJudge(raw, Q.turns.length > 1); if (!v) throw {code: 'invalid_json'}; return v; });
    Object.assign(turn, {verdict: j.verdict, feedback: j.feedback, fix: j.fix});
    V.busy = null; d.updatedAt = Date.now(); persist(d, 0);
    if (j.follow && Q.turns.length < 2) {
      Q.turns.push({q: j.follow, a: '', ms: 0, pasted: 0, spoken: false, verdict: null, feedback: '', fix: ''});
      V.draft = ''; V.pasted = 0; V.spoken = false; V.t0 = Date.now();
      renderDefend(); say(j.feedback + ' ' + j.follow);
      const b = $('#vivaAns'); if (b) b.focus({preventScroll: true});
    } else { renderDefend(); say(j.feedback); refocus(defEl, '#vivaNext'); }
  } catch (err) {
    V.busy = null; V.err = err; noteAiError(err); renderDefend(); refocus(defEl);
  }
}
function skipQuestion() {
  const V = st.viva; if (!V || !V.s || V.busy) return;
  stopDictation(); hush();
  const Q = V.s.qs[V.qi], turn = Q.turns[Q.turns.length - 1];
  if (turn && !turn.verdict) { turn.verdict = 'skipped'; turn.a = ''; }
  V.qi++; persist(V.doc); askNext(V);
}
function nextQuestion() { const V = st.viva; if (!V || V.busy) return; hush(); V.qi++; askNext(V); }
function finishViva(V) {
  hush(); stopDictation();
  for (const Q of V.s.qs) { const t = Q.turns[Q.turns.length - 1]; if (!t) Q.turns.push({q: Q.q, a: '', ms: 0, pasted: 0, spoken: false, verdict: 'skipped', feedback: '', fix: ''}); else if (!t.verdict) t.verdict = 'skipped'; }
  V.s.done = true; V.doc.updatedAt = Date.now(); persist(V.doc, 0);
  st.vivaView = V.s.id; st.viva = null;
  renderDefend(); refocus(defEl);
}
// How a question went: the verdict on its last answer.
const outcome = Q => { const t = Q.turns[Q.turns.length - 1]; return t && t.verdict ? t.verdict : 'pending'; };
function tally(s) { const n = {strong: 0, partial: 0, weak: 0, skipped: 0}; for (const Q of s.qs) { const o = outcome(Q); if (hasOwn(n, o)) n[o]++; } return n; }

// ---- the view ----
function renderDefend() {
  if (st.mode !== 'defend' || !st.cur) return;
  const d = st.cur, V = st.viva && st.viva.doc === d ? st.viva : null, view = st.vivaView && (d.defences || []).find(s => s.id === st.vivaView);
  const head = h('div', {class: 'chead2'},
    h('button', {class: 'btn sm ghost', type: 'button', onclick: () => setMode('write')}, '← Back to the essay'),
    h('h2', null, 'Defend it'),
    st.tts ? h('label', {class: 'vvoice'}, h('button', {type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(st.vivaVoice), 'aria-label': 'Read questions aloud',
      onclick: () => { st.vivaVoice = !st.vivaVoice; if (!st.vivaVoice) hush(); renderDefend(); }}, h('span', {class: 'knob'})), h('span', null, 'Read questions aloud')) : null);
  let body;
  if (view) body = reportEl(d, view);
  else if (V && (V.busy === 'ask' || (V.err && !V.s))) body = V.err ? vivaErrEl(V, startViva) : h('section', {class: 'prog', 'aria-live': 'polite'}, h('div', {class: 'pbar'}, h('i')),
    h('div', {class: 'ptxt'}, h('b', null, 'Reading your essay and choosing questions…'), h('span', null, VIVA_STYLE[st.vivaStyle].label + ' · ' + plural(st.vivaN, 'question'))));
  else if (V && V.s) body = questionEl(V);
  else body = setupEl(d);
  fill(defEl, head, body);
}
function vivaErrEl(V, retry) {
  return h('section', {class: 'errc', role: 'alert'}, h('b', null, 'The examiner didn’t answer'), h('p', null, errText(V.err)),
    isHard(V.err) ? null : h('button', {class: 'btn sm', type: 'button', onclick: () => { V.err = null; retry(); }}, 'Try again'));
}
function dotsEl(s, cur) {
  return h('ol', {class: 'vdots', 'aria-label': 'Questions'}, s.qs.map((Q, i) => {
    const o = outcome(Q), I = hasOwn(VERDICT_INFO, o) ? VERDICT_INFO[o] : null;
    return h('li', {class: 'vdot' + (i === cur ? ' cur' : '') + (I ? ' done' : ''), style: I ? '--vc:var(' + I.c + ')' : null, title: 'Question ' + (i + 1) + (I ? ': ' + I.label : '')}, h('span', {class: 'sr'}, 'Question ' + (i + 1) + (I ? ': ' + I.label : '')));
  }));
}
function setupEl(d) {
  const past = (d.defences || []).slice().reverse();
  const seg = (name, opts, cur, set) => h('div', {class: 'vseg', role: 'group', 'aria-label': name}, opts.map(([v, label]) =>
    h('button', {type: 'button', class: 'chip', 'aria-pressed': String(cur === v), onclick: () => { set(v); renderDefend(); }}, label)));
  const off = st.ai === 'denied' || st.ai === 'off';
  return h('div', {class: 'vsetup'},
    h('p', {class: 'vintro'}, 'An examiner asks about the weakest points in “' + (d.title || 'your essay') + '”: the thesis, the steps it assumes, the objections it leaves open. Answer in your own words' + (st.dict ? ', out loud or typed' : '') + '. Each answer gets a verdict, and you finish with a list of what to fix in the essay.'),
    h('div', {class: 'vopts'},
      h('div', null, h('span', {class: 'lbl'}, 'Examiner'), seg('Examiner', Object.entries(VIVA_STYLE).map(([k, v]) => [k, v.label]), st.vivaStyle, v => { st.vivaStyle = v; })),
      h('div', null, h('span', {class: 'lbl'}, 'Questions'), seg('Number of questions', [[3, '3'], [5, '5'], [SESSION_MAX, String(SESSION_MAX)]], st.vivaN, v => { st.vivaN = v; }))),
    h('div', {class: 'acts'}, h('button', {class: 'btn primary', type: 'button', id: 'vivaStart', onclick: startViva, disabled: off}, 'Start the viva')),
    h('p', {class: 'fine'}, off && st.aiWhy ? st.aiWhy : 'Uses your Claude plan: one request to set the questions, then one per answer.'),
    past.length ? h('section', {class: 'vpast'}, h('span', {class: 'lbl'}, 'Your vivas on this essay'),
      h('ul', null, past.map(s => { const n = tally(s); return h('li', null, dotsEl(s, -1),
        h('span', null, ago(s.at) + ' · ' + VIVA_STYLE[s.style].label + ' · ' + n.strong + ' strong of ' + s.qs.length + (s.done ? '' : ' · unfinished')),
        h('button', {class: 'lnk', type: 'button', onclick: () => { st.vivaView = s.id; renderDefend(); }}, 'See the report')); }))) : null);
}
function questionEl(V) {
  const s = V.s, Q = s.qs[V.qi], turns = Q.turns, last = turns[turns.length - 1], judged = !!(last && last.verdict), busy = V.busy === 'judge';
  const isLast = V.qi === s.qs.length - 1;
  return h('div', {class: 'vq'},
    dotsEl(s, V.qi),
    h('p', {class: 'smeta'}, 'Question ' + (V.qi + 1) + ' of ' + s.qs.length + (Q.para ? ' · about ¶' + Q.para : ' · about the essay as a whole')),
    Q.quote ? h('div', {class: 'q vquote', style: '--tc:var(--ink3)'}, h('span', {class: 'ql'}, '¶' + Q.para), h('span', {class: 'qt'}, '“' + trunc(Q.quote, 320) + '”')) : null,
    turns.map((t, i) => {
      const open = i === turns.length - 1 && !t.verdict, I = t.verdict && hasOwn(VERDICT_INFO, t.verdict) ? VERDICT_INFO[t.verdict] : null;
      return h('section', {class: 'vturn' + (i ? ' follow' : '')},
        h('div', {class: 'vask'}, i ? h('span', {class: 'lbl'}, 'Follow-up') : null, h('p', {class: 'vqtext'}, t.q),
          st.tts && st.vivaVoice ? h('button', {class: 'lnk', type: 'button', onclick: () => say(t.q)}, 'Hear it again') : null),
        open ? answerBoxEl(V, busy) : h('div', {class: 'vans'},
          t.a ? h('p', {class: 'vyou'}, h('span', {class: 'lbl'}, 'You' + (t.spoken ? ' · spoken' : '') + (t.ms ? ' · ' + secs(t.ms) : '')), t.a) : null,
          I ? h('div', {class: 'vverdict', style: '--vc:var(' + I.c + ')'}, h('b', {class: 'vpill'}, I.label), t.feedback ? h('p', null, t.feedback) : null,
            t.fix ? h('p', {class: 'vfix'}, h('b', null, 'For the essay: '), t.fix) : null) : null));
    }),
    V.err ? vivaErrEl(V, submitAnswer) : null,
    judged ? h('div', {class: 'acts'}, h('button', {class: 'btn primary', type: 'button', id: 'vivaNext', onclick: nextQuestion}, isLast ? 'See your report' : 'Next question'),
      h('button', {class: 'btn ghost', type: 'button', onclick: () => finishViva(V)}, 'End the viva')) : null);
}
const secs = ms => { const s = Math.round(ms / 1000); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s'; };
function answerBoxEl(V, busy) {
  return h('div', {class: 'vbox'},
    h('textarea', {id: 'vivaAns', class: 'vinput', rows: 4, maxlength: 1200, placeholder: st.dict && !st.dictBlocked ? 'Answer out loud, or type here' : 'Type your answer',
      'aria-label': 'Your answer', disabled: busy,
      oninput: e => { V.draft = e.target.value; },
      onpaste: e => { V.pasted += ((e.clipboardData && e.clipboardData.getData('text')) || '').length; },
      onkeydown: e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submitAnswer(); } }}, V.draft || ''),
    h('p', {class: 'vpartial', id: 'vivaPartial', 'aria-live': 'polite'}),
    h('div', {class: 'acts'},
      st.dict && !st.dictBlocked ? h('button', {type: 'button', class: 'btn sm mic', id: 'vivaMic', 'aria-pressed': String(!!st.dictOn), onclick: toggleDictation, disabled: busy},
        h('span', {class: 'micdot', 'aria-hidden': 'true'}), h('span', null, st.dictOn ? 'Stop listening' : 'Answer out loud')) : null,
      h('button', {type: 'button', class: 'btn sm primary', id: 'vivaSubmit', onclick: submitAnswer, disabled: busy}, busy ? 'Judging…' : 'Submit answer'),
      h('button', {type: 'button', class: 'btn sm ghost', onclick: skipQuestion, disabled: busy}, 'Skip')),
    h('p', {class: 'fine'}, (mac ? '⌘' : 'Ctrl') + '+Enter submits. Answer as you would out loud: a minute is plenty.'));
}
function reportEl(d, s) {
  const n = tally(s), fixes = [];
  for (const Q of s.qs) for (const t of Q.turns) if (t.fix) fixes.push({fix: t.fix, Q});
  return h('div', {class: 'vreport'},
    dotsEl(s, -1),
    h('p', {class: 'vscore'}, h('b', null, n.strong + ' of ' + s.qs.length), ' answers held up' + (n.partial ? ', ' + n.partial + ' partly' : '') + (n.weak ? ', ' + n.weak + ' didn’t' : '') + (n.skipped ? ', ' + n.skipped + ' skipped' : '') + '.'),
    h('p', {class: 'smeta'}, VIVA_STYLE[s.style].label + ' · ' + ago(s.at)),
    fixes.length ? h('section', {class: 'vfixes'}, h('span', {class: 'lbl'}, 'What to fix in the essay'),
      h('ul', null, fixes.map(f => h('li', null, h('p', null, f.fix), f.Q.quote ? h('button', {class: 'lnk', type: 'button', onclick: () => showInEssay(f.Q.quote)}, 'Show ¶' + f.Q.para + ' in the essay') : null)))) : null,
    h('ol', {class: 'vlist'}, s.qs.map((Q, i) => {
      const o = outcome(Q), I = hasOwn(VERDICT_INFO, o) ? VERDICT_INFO[o] : VERDICT_INFO.skipped;
      return h('li', {style: '--vc:var(' + I.c + ')'}, h('div', {class: 'vlhead'}, h('b', {class: 'vpill'}, I.label), h('span', {class: 'smeta'}, 'Question ' + (i + 1) + (Q.para ? ' · ¶' + Q.para : ''))),
        h('p', {class: 'vqtext sm'}, Q.q),
        Q.turns.map((t, k) => h('div', {class: 'vrt'}, k ? h('p', {class: 'vfollow'}, h('b', null, 'Follow-up: '), t.q) : null,
          t.a ? h('p', {class: 'vyou'}, h('span', {class: 'lbl'}, 'You' + (t.spoken ? ' · spoken' : '') + (t.pasted > t.a.length / 2 ? ' · pasted' : '')), t.a) : h('p', {class: 'khint'}, 'No answer.'),
          t.feedback ? h('p', {class: 'vfb'}, t.feedback) : null)));
    })),
    h('div', {class: 'acts'}, h('button', {class: 'btn primary', type: 'button', onclick: () => { st.vivaView = null; renderDefend(); }}, 'Practise again'),
      h('button', {class: 'btn ghost', type: 'button', onclick: () => setMode('write')}, 'Back to the essay')));
}
function showInEssay(q) { setMode('write'); const r = anchorFuzzy(ed.value, q); if (r) requestAnimationFrame(() => scrollToRange(r, 0.3)); }
