// ---- the owner's Usage view: who uses Throughline, what for, what it would cost on the website, how good the notes
// are, and how close Phase 1 is to its gate. Everything comes from the testers' usage records (37-usage.js).
// Costs are estimates: tokens from characters (CPT to a token), priced with the model each feature would use on the
// website (FEATURES, PRICES in 00-config.js). The weeks are calendar weeks from Monday, in UTC.
const usageEl = $('#usage');
const CPT = 4;
const money = v => !(v > 0) ? '$0' : v >= 100 ? '$' + Math.round(v) : v >= 0.995 ? '$' + v.toFixed(2) : v >= 0.01 ? '$' + v.toFixed(2) : '<$0.01';
const toks = c => { const t = c / CPT; return t >= 1e6 ? (t / 1e6).toFixed(1) + 'M' : t >= 1e4 ? Math.round(t / 1e3) + 'k' : t >= 1e3 ? (t / 1e3).toFixed(1) + 'k' : String(Math.round(t)); };
const featLabel = k => hasOwn(FEATURES, k) ? FEATURES[k][0] : k;
const featCost = (k, v) => hasOwn(FEATURES, k) ? usageCost(v, PRICES[FEATURES[k][1]], CPT) : 0;
const dayMinus = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const fmtUtc = k => new Date(k + 'T00:00:00Z').toLocaleDateString(undefined, {day: 'numeric', month: 'short', timeZone: 'UTC'});
const pctOf = (a, b) => b ? Math.round(a / b * 100) : 0;
let usageSub = false;
function openUsage() {
  closeMenus();
  if (!usageSub && dbApi) {
    usageSub = true; st.usage = null; st.usageErr = false;
    try {
      dbApi.collection('usage').onSnapshot(snap => {
        const list = [];
        for (const d of snap.docs) {
          let u = null; try { u = cleanUsage(structuredClone(d.data()), Object.keys(TYPES)); } catch (e) {}
          if (u && safeId(d.id) && (Object.keys(u.days).length || Object.keys(u.old.f).length)) list.push(Object.assign(u, {id: d.id}));
        }
        st.usage = list; renderUsage();
      }, () => { st.usage = []; st.usageErr = true; renderUsage(); });
    } catch (e) { st.usage = []; st.usageErr = true; }
  }
  setMode('usage');
}

// ---- the numbers ----
function usageStats(list, today) {
  const weeks = lastWeeks(today, 8), last4 = weeks.slice(-4), from = last4[0], from14 = dayMinus(today, 13);
  const people = list.map(u => {
    const any = activeWeeks(u, false), real = activeWeeks(u, true), sum = usageSum(u, from, today);
    let calls = 0, cost = 0, up = 0, down = 0;
    for (const k of USAGE_FEATURES) if (hasOwn(sum.f, k)) { calls += sum.f[k].n || 0; cost += featCost(k, sum.f[k]); }
    for (const t of Object.keys(sum.q)) { up += sum.q[t].u || 0; down += sum.q[t].d || 0; }
    const active = Object.keys(u.days).filter(k => dayCalls(u.days[k], false) > 0).sort(), inWin = active.filter(k => k >= from);
    // A month projected from the last four weeks: cost per day since they started (at least a week), times 30.
    const span = inWin.length ? (Date.parse(today) - Date.parse(inWin[0])) / 864e5 + 1 : 0;
    return {u, own: u.own, name: u.name || 'A tester', sum, calls, cost, monthly: span ? cost / Math.max(7, span) * 30 : 0, up, down,
      w4: last4.filter(w => any.has(w)).length, r4: last4.filter(w => real.has(w)).length, weeks: any, last: active[active.length - 1] || null,
      errs14: Object.keys(u.days).filter(k => k >= from14).reduce((s, k) => s + (u.days[k].e.js || 0) + (u.days[k].e.save || 0), 0)};
  });
  const shown = people.filter(p => st.usageMine || !p.own), testers = people.filter(p => !p.own);
  const total = {f: {}, q: {}, e: {}};
  for (const p of shown) usageAddDay(total, p.sum);
  const feats = USAGE_FEATURES.filter(k => hasOwn(total.f, k) && total.f[k].n).map(k => {
    const v = total.f[k], x = v.x || {}, failed = USAGE_FAILS.filter(f => f !== 'cancelled').reduce((s, f) => s + (x[f] || 0), 0);
    return {k, v, users: shown.filter(p => hasOwn(p.sum.f, k) && p.sum.f[k].n).length, cost: featCost(k, v), failed, avgMs: v.ok ? v.ms / v.ok : 0};
  }).sort((a, b) => b.v.n - a.v.n);
  const notes = Object.keys(TYPES).filter(t => hasOwn(total.q, t)).map(t => ({t, q: total.q[t]}));
  const monthly = testers.filter(p => p.calls).map(p => p.monthly), sureCost = testers.filter(p => p.w4 >= 2).length >= 3;
  const per = k => { const v = total.f[k]; return v && v.n ? featCost(k, v) / v.n : null; };
  const rated = testers.reduce((s, p) => s + p.up + p.down, 0), useful = testers.reduce((s, p) => s + p.up, 0);
  const real = testers.filter(p => p.r4 > 0), recurring = real.filter(p => p.r4 >= 3);
  const firstSeen = testers.map(p => p.u.since).filter(Boolean).sort((a, b) => a - b)[0] || 0;
  const errs14 = testers.reduce((s, p) => s + p.errs14, 0);
  return {today, weeks, last4, from, people, shown, total, feats, notes, per,
    weekly: weeks.map(w => ({w, n: shown.filter(p => p.weeks.has(w)).length, real: shown.filter(p => activeWeeks(p.u, true).has(w)).length})),
    cost: {typical: pctile(monthly, 50), heavy: pctile(monthly, 90), n: monthly.length, sure: sureCost, all: shown.reduce((s, p) => s + p.cost, 0)},
    gate: {real: real.length, recurring: recurring.length, rated, useful, errs14, days: firstSeen ? Math.floor((Date.now() - firstSeen) / 864e5) : 0, sureCost, monthly: monthly.length}};
}

// ---- the view ----
function renderUsage() {
  if (st.mode !== 'usage') return;
  const head = h('div', {class: 'chead2'}, h('button', {class: 'btn sm ghost', type: 'button', onclick: () => setMode('write')}, '← Back to the essay'), h('h2', null, 'Usage'));
  const list = st.usage;
  if (list == null) { fill(usageEl, head, h('p', {class: 'rsub'}, 'Loading…')); return; }
  if (st.usageErr) { fill(usageEl, head, h('p', {class: 'rsub'}, 'Usage can’t be read in this view.')); return; }
  const mine = h('label', {class: 'flab tog'}, h('input', {type: 'checkbox', id: 'usageMine', checked: !!st.usageMine, onchange: e => { st.usageMine = e.target.checked; renderUsage(); }}), h('span', null, 'Include my own use'));
  if (!list.length) {
    fill(usageEl, head, h('p', {class: 'rnote'}, 'Nothing counted yet. Each tester’s use is counted from their first AI action after the welcome has told them about it. Your own use counts too, marked as yours.'));
    return;
  }
  const S = usageStats(list, utcDay()), G = S.gate, tile = (k, v, sub, ok) => h('div', {class: 'rtile' + (ok == null ? '' : ok ? ' met' : ' notyet')},
    h('span', {class: 'lbl'}, k), h('b', null, v), sub ? h('span', {class: 'sub'}, sub) : null,
    ok == null ? null : h('span', {class: 'gstat'}, h('i', {'aria-hidden': 'true'}, ok ? '✓' : '○'), ok ? 'Met' : 'Not yet'));
  const pct = G.rated ? pctOf(G.useful, G.rated) : null;
  fill(usageEl, head,
    h('p', {class: 'rsub'}, plural(S.people.filter(p => !p.own).length, 'tester') + ' · the last four weeks, from ' + fmtUtc(S.from) + ' · costs are estimates at API prices'),
    mine,
    h('section', {class: 'rsec'}, h('h3', null, 'Gate to Phase 2'),
      h('div', {class: 'rtiles'},
        tile('Testers on their own essays', G.real + ' active · ' + G.recurring + ' recurring', 'Target: 5 to 10, at least half recurring (3 of the last 4 weeks)', G.real >= 5 && G.recurring * 2 >= G.real),
        tile('Notes rated useful', pct == null ? '–' : pct + '%', G.rated ? 'of ' + plural(G.rated, 'rated note') + ' · target 80%' : 'No notes rated yet · target 80%', G.rated >= 20 && pct >= 80),
        tile('Page errors and failed saves', String(G.errs14), 'in the last 14 days · target: none for two weeks', G.errs14 === 0 && G.days >= 14),
        tile('Cost per tester per month', G.monthly ? money(S.cost.typical) + ' · ' + money(S.cost.heavy) : '–', G.monthly ? 'typical · heaviest 10%' + (G.sureCost ? '' : ' · needs 3 testers with 2 weeks of use') : 'No use yet', G.sureCost))),
    h('section', {class: 'rsec'}, h('h3', null, 'Active testers each week'),
      h('p', {class: 'smeta'}, 'Testers who ran at least one AI action that week' + (st.usageMine ? ', you included' : '') + '.'), weeklyChart(S)),
    h('section', {class: 'rsec'}, h('h3', null, 'What it would cost'),
      h('div', {class: 'rtiles'},
        tile('Typical tester, per month', S.cost.n ? money(S.cost.typical) : '–', S.cost.n ? 'the median of ' + plural(S.cost.n, 'tester') : null),
        tile('Heaviest 10%, per month', S.cost.n ? money(S.cost.heavy) : '–', S.cost.n ? '9 in 10 testers cost less' : null),
        tile('One full review', S.per('review') == null ? '–' : money(S.per('review')), S.total.f.review ? 'average of ' + plural(S.total.f.review.n, 'review') : 'none yet'),
        tile('One re-check', S.per('recheck') == null ? '–' : money(S.per('recheck')), S.total.f.recheck ? 'average of ' + plural(S.total.f.recheck.n, 're-check') : 'none yet')),
      h('p', {class: 'fine'}, 'Monthly costs are projected from each tester’s last four weeks (at least a week of use). Each feature is priced with the model planned for it on the website: ' +
        Object.keys(PRICES).map(m => PRICES[m].label + ' at $' + PRICES[m].in + ' in and $' + PRICES[m].out + ' out per million tokens').join('; ') +
        '. Tokens are estimated as characters ÷ ' + CPT + '; Claude’s hidden thinking and the savings from caching aren’t included. All shown testers together: ' + money(S.cost.all) + '.')),
    h('section', {class: 'rsec'}, h('h3', null, 'What testers use'), featTable(S)),
    h('section', {class: 'rsec'}, h('h3', null, 'Review quality'),
      h('p', {class: 'smeta'}, 'Notes each review showed for the first time, how testers rated them, and what happened to them. The sample essay doesn’t count.'), notesTable(S)),
    problemsEl(S),
    h('section', {class: 'rsec'}, h('h3', null, 'Testers'), peopleTable(S)));
}
function weeklyChart(S) {
  const W0 = S.weekly, n = W0.length, max = Math.max(1, ...W0.map(x => x.n)), yMax = [1, 2, 4, 5, 10, 15, 20, 25, 50, 100].find(v => v >= max) || Math.ceil(max / 50) * 50;
  const W = 640, PH = 90, TOP = 14, sw = W / n, cx = i => i * sw + sw / 2, y = v => TOP + PH - v / yMax * PH;
  const svg = sv('svg', {class: 'rchart', viewBox: '0 0 ' + W + ' ' + (TOP + PH + 1), 'aria-hidden': 'true'}), bars = [];
  svg.append(sv('line', {class: 'rgrid', x1: 0, x2: W, y1: TOP + .5, y2: TOP + .5}), sv('line', {class: 'raxisl', x1: 0, x2: W, y1: TOP + PH + .5, y2: TOP + PH + .5}),
    Object.assign(sv('text', {class: 'rtick', x: W, y: TOP - 4, 'text-anchor': 'end'}), {textContent: plural(yMax, 'tester')}));
  W0.forEach((x, i) => {
    if (!x.n) { bars.push(null); return; }
    const bw = Math.min(36, sw - 10), l = cx(i) - bw / 2, top = y(x.n), base = TOP + PH, r = Math.min(4, bw / 2, base - top);
    const b = sv('path', {class: 'rbar', d: 'M' + l + ' ' + base + 'V' + (top + r) + 'Q' + l + ' ' + top + ' ' + (l + r) + ' ' + top + 'H' + (l + bw - r) + 'Q' + (l + bw) + ' ' + top + ' ' + (l + bw) + ' ' + (top + r) + 'V' + base + 'Z'});
    bars.push(b); svg.append(b);
  });
  const read = h('p', {class: 'rread', 'aria-live': 'polite'});
  const show = (i, on) => {
    svg.classList.toggle('hovering', on && !!bars[i]); bars.forEach((b, j) => b && b.classList.toggle('on', j === i));
    const x = W0[i];
    fill(read, 'Week of ' + fmtUtc(x.w) + ': ', h('b', null, plural(x.n, 'active tester')), x.n ? ', ' + x.real + ' on their own essays' : '');
    fig.dataset.i = i;
  };
  const at = e => { const r = svg.getBoundingClientRect(); return Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / r.width * n))); };
  const fig = h('div', {class: 'rfig', tabindex: '0', role: 'group', 'aria-label': 'Active testers each week. Use the arrow keys to read each week.',
    onpointermove: e => show(at(e), true), onpointerdown: e => show(at(e), true), onpointerleave: () => show(n - 1, false), onblur: () => show(n - 1, false),
    onkeydown: e => { const i = +fig.dataset.i, j = e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowRight' ? i + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
      if (j == null) return; e.preventDefault(); show(Math.max(0, Math.min(n - 1, j)), true); }},
    svg, h('div', {class: 'raxis'}, h('span', null, fmtUtc(W0[0].w)), h('span', null, 'this week')));
  show(n - 1, false);
  return h('div', {class: 'rdays'}, fig, read,
    h('details', {class: 'rlist'}, h('summary', null, 'Week by week'),
      h('div', {class: 'rscroll'}, h('table', {class: 'rtable'}, h('thead', null, h('tr', null, h('th', null, 'Week of'), h('th', {class: 'num'}, 'Active testers'), h('th', {class: 'num'}, 'On their own essays'))),
        h('tbody', null, W0.slice().reverse().map(x => h('tr', null, h('td', null, fmtUtc(x.w)), h('td', {class: 'num'}, x.n), h('td', {class: 'num'}, x.real))))))));
}
function featTable(S) {
  if (!S.feats.length) return h('p', {class: 'khint'}, 'No AI actions in the last four weeks.');
  const sec = ms => ms >= 60000 ? Math.floor(ms / 60000) + ' min ' + Math.round(ms % 60000 / 1000) + ' s' : Math.round(ms / 1000) + ' s';
  return h('div', {class: 'rscroll'}, h('table', {class: 'rtable', id: 'usageFeats'},
    h('thead', null, h('tr', null, ['Feature', 'Calls', 'Testers', 'Tokens in', 'Tokens out', 'Cost', 'Per call', 'Average time', 'Failed'].map((x, i) => h('th', {class: i ? 'num' : null}, x)))),
    h('tbody', null, S.feats.map(F => h('tr', null, h('td', null, featLabel(F.k)), h('td', {class: 'num'}, F.v.n), h('td', {class: 'num'}, F.users),
      h('td', {class: 'num'}, toks(F.v.i || 0)), h('td', {class: 'num'}, toks(F.v.o || 0)), h('td', {class: 'num'}, money(F.cost)), h('td', {class: 'num'}, money(F.cost / F.v.n)),
      h('td', {class: 'num'}, F.avgMs ? sec(F.avgMs) : '–'), h('td', {class: 'num'}, F.failed ? F.failed + ' (' + pctOf(F.failed, F.v.n) + '%)' : '0'))))));
}
function notesTable(S) {
  if (!S.notes.length) return h('p', {class: 'khint'}, 'No reviews of testers’ own essays in the last four weeks.');
  const all = {s: 0, u: 0, d: 0, f: 0, x: 0, w: {}};
  for (const {q} of S.notes) { for (const k of NOTE_FIELDS) all[k] += q[k] || 0; for (const k of NOTE_WHY) all.w[k] = (all.w[k] || 0) + ((q.w || {})[k] || 0); }
  const why = w => { const top = NOTE_WHY.filter(k => (w || {})[k] > 0).sort((a, b) => w[b] - w[a])[0]; return top ? RATE_WHY.find(([k]) => k === top)[1] + ' (' + w[top] + ')' : '–'; };
  const row = (label, q, strong) => h('tr', {class: strong ? 'tot' : null}, h('td', null, label), h('td', {class: 'num'}, q.s || 0), h('td', {class: 'num'}, q.u || 0), h('td', {class: 'num'}, q.d || 0),
    h('td', {class: 'num'}, (q.u || 0) + (q.d || 0) ? pctOf(q.u || 0, (q.u || 0) + (q.d || 0)) + '%' : '–'), h('td', {class: 'num'}, q.f || 0), h('td', {class: 'num'}, q.x || 0), h('td', null, why(q.w)));
  return h('div', {class: 'rscroll'}, h('table', {class: 'rtable', id: 'usageNotes'},
    h('thead', null, h('tr', null, ['Kind of note', 'Shown', 'Useful', 'Not useful', 'Rated useful', 'Fixed', 'Dismissed', 'Main reason when not useful'].map((x, i) => h('th', {class: i && i < 7 ? 'num' : null}, x)))),
    h('tbody', null, S.notes.map(({t, q}) => row(TYPES[t].label, q)), row('All notes', all, true))));
}
function problemsEl(S) {
  const x = {}; for (const F of S.feats) for (const k of USAGE_FAILS) x[k] = (x[k] || 0) + ((F.v.x || {})[k] || 0);
  const rv = ['review', 'recheck'].reduce((a, k) => { const v = S.total.f[k]; if (v) { a.n += v.n; a.limit += (v.x || {}).limit || 0; } return a; }, {n: 0, limit: 0});
  const errs = S.shown.flatMap(p => p.u.errs.map(e => Object.assign({who: p.name}, e))).sort((a, b) => b.at - a.at).slice(0, 8);
  return h('section', {class: 'rsec'}, h('h3', null, 'Limits and failures'),
    h('div', {class: 'rtiles'},
      h('div', {class: 'rtile'}, h('span', {class: 'lbl'}, 'Reviews stopped by a Claude plan’s limit'), h('b', null, rv.limit + ' of ' + rv.n), h('span', {class: 'sub'}, 'full reviews and re-checks')),
      h('div', {class: 'rtile'}, h('span', {class: 'lbl'}, 'Unusable answers'), h('b', null, String(x.unusable || 0)), h('span', {class: 'sub'}, 'Claude answered, but not in a form the app could use')),
      h('div', {class: 'rtile'}, h('span', {class: 'lbl'}, 'Too busy or timed out'), h('b', null, String((x.busy || 0) + (x.timeout || 0))), h('span', {class: 'sub'}, 'asked to wait, or no answer in time')),
      h('div', {class: 'rtile'}, h('span', {class: 'lbl'}, 'Stopped by the tester'), h('b', null, String(x.cancelled || 0)), h('span', {class: 'sub'}, 'pressed Stop'))),
    errs.length ? h('details', {class: 'rlist'}, h('summary', null, 'Latest page errors and failed saves'),
      h('ul', null, errs.map(e => h('li', null, h('span', null, h('b', null, e.n), e.l ? ' at line ' + e.l + ', column ' + e.c : ''), h('span', {class: 'smeta'}, e.who + ' · ' + ago(e.at)))))) : null);
}
function peopleTable(S) {
  const rows = S.shown.slice().sort((a, b) => (b.last || '').localeCompare(a.last || '') || b.calls - a.calls);
  const dots = p => h('span', {class: 'wdots', role: 'img', 'aria-label': 'Active in ' + p.w4 + ' of the last 4 weeks'}, S.last4.map(w => h('i', {class: p.weeks.has(w) ? 'on' : null})));
  return h('div', {class: 'rscroll'}, h('table', {class: 'rtable', id: 'usagePeople'},
    h('thead', null, h('tr', null, ['Tester', 'Last 4 weeks', 'Last active', 'Calls', 'Per month', 'Notes rated useful', 'Counting since'].map((x, i) => h('th', {class: [3, 4, 5].includes(i) ? 'num' : null}, x)))),
    h('tbody', null, rows.map(p => h('tr', null, h('td', null, p.name, p.own ? h('span', {class: 'tag'}, 'you') : null), h('td', null, dots(p)),
      h('td', null, p.last ? fmtUtc(p.last) : '–'), h('td', {class: 'num'}, p.calls), h('td', {class: 'num'}, p.calls ? money(p.monthly) : '–'),
      h('td', {class: 'num'}, p.up + p.down ? pctOf(p.up, p.up + p.down) + '% of ' + (p.up + p.down) : '–'), h('td', null, p.u.since ? ago(p.u.since) : '–'))))));
}
