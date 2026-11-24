// ---- research map: everything you've written and read, and how it connects ----
// Map mode reads the claims of every essay and source (long ones from their cached claims index) and asks Claude
// for themes, links (clash, supports, builds on, critiques, cites) down to the passage, and open threads. The map
// is one record beside the documents ('rmap'); it goes out of date when the library changes.
const mapEl = $('#rmap');
const MAP_KIND = {
  clash: {label: 'clashes with', short: 'clash', c: '--rel', group: 'clash'},
  supports: {label: 'supports', short: 'supports', c: '--evid', group: 'supports'},
  critiques: {label: 'critiques', short: 'critiques', c: '--logic', group: 'cites'},
  builds_on: {label: 'builds on', short: 'builds on', c: '--ink3', group: 'cites'},
  cites: {label: 'cites', short: 'cites', c: '--ink3', group: 'cites'},
};
const MAP_FILTERS = [['all', 'All links'], ['clash', 'Clashes'], ['supports', 'Supports'], ['cites', 'Cites and responds']];
const DOC_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12M6 8h4M6 10.5h4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>';
function mapDocs() { return sortedDocs().filter(d => !d.isSample && d.text.trim().length >= 200).slice(0, 30); }
function mapSig(docs) { return hash(docs.map(d => d.id + ':' + hash(d.text)).sort().join('|')); }
const paraOf = (d, q) => { const r = q ? anchorFuzzy(d.text, q) : null; return r ? paraIndex(paraStarts(d.text), r[0]) : 0; };

// ---- storage: one record beside the documents ----
function cleanRmap(x) {
  const r = plainObj(x), ids = v => (Array.isArray(v) ? v : []).filter(safeId).slice(0, 60);
  if (r.kind !== 'rmap') return null;
  return {at: num(r.at, 0), sig: typeof r.sig === 'string' ? r.sig.slice(0, 24) : '', hidden: ids(r.hidden),
    themes: (Array.isArray(r.themes) ? r.themes : []).slice(0, 6).map(t0 => { const t = plainObj(t0); return {name: clip(t.name, 60), docs: ids(t.docs)}; }).filter(t => t.name && t.docs.length),
    links: (Array.isArray(r.links) ? r.links : []).slice(0, 24).map(l0 => {
      const l = plainObj(l0);
      return safeId(l.id) && safeId(l.from) && safeId(l.to) && RMAP_KINDS.includes(l.kind) && str1500(l.qa)
        ? {id: l.id, from: l.from, to: l.to, kind: l.kind, qa: clip(l.qa, 600), qb: l.qb ? clip(l.qb, 600) || null : null, note: clip(l.note, 240), fix: clip(l.fix, 240)} : null;
    }).filter(Boolean),
    threads: (Array.isArray(r.threads) ? r.threads : []).slice(0, 5).map(t0 => { const t = plainObj(t0); return {q: clip(t.q, 220), docs: ids(t.docs).slice(0, 12), note: clip(t.note, 240)}; }).filter(t => t.q && t.docs.length)};
}
function mapRecord() { return Object.assign({kind: 'rmap', v: 1}, st.rmap); }
async function saveMap() {
  try {
    if (st.store === 'db') await col.doc('rmap').set(mapRecord());
    else if (st.store === 'local') writeLocal();
  } catch (e) { toast('Couldn’t save the map. It stays until you reload.'); }
}

// ---- the AI call (only when the writer asks) ----
function mapContext(docs) {
  const items = docs.map(d => ({id: d.id, fullBytes: bytes(d.text), claimsBytes: indexFresh(d) ? bytes(claimsText(d)) : null}));
  const {plan} = planContext(items, Math.max(0, LIMITS.promptBytes - bytes(MAP_RULES) - 8000), LIMITS.fullTextBytes);
  return docs.filter(d => plan.has(d.id)).map((d, i) => ({doc: d, ref: 'D' + (i + 1), mode: plan.get(d.id)}));
}
async function runMap() {
  if (st.mapRun) return;
  const docs = mapDocs();
  if (docs.length < 2) { toast('Add at least two essays or sources first.'); return; }
  if (st.ai === 'pending') await capsReady;
  if (!sampleFn || st.ai !== 'ready') { toast(st.aiWhy || 'AI isn’t available in this view.'); return; }
  const tier = pickTier(), R = st.mapRun = {ctl: new AbortController(), stage: '', t0: Date.now()};
  st.mapErr = null; renderMap();
  const tick = setInterval(updateMapProgress, 1000);
  try {
    await ensureIndexed(docs, (i, n) => { R.stage = 'Reading your library · ' + i + ' of ' + n; updateMapProgress(); });
    if (R.ctl.signal.aborted) throw {code: 'cancelled'};
    R.stage = 'Mapping how it connects…'; updateMapProgress();
    const ctx = mapContext(docs);
    if (ctx.length < 2) throw {code: 'prompt_too_large'};
    const prompt = MAP_RULES + '\n\nDOCUMENTS (role "essay": the writer’s own essays; role "source": material they use):\n' + docsBlock(ctx);
    const opts = {signal: R.ctl.signal}; if (tier) opts.modelTier = tier;
    const m = validateRmap(await sampleFn.json(prompt, opts), {resolveDoc: ctxResolver(ctx)});
    if (!m.themes.length && !m.links.length) throw {code: 'invalid_json'};
    const rid = Date.now().toString(36);
    st.rmap = {at: Date.now(), sig: mapSig(docs), hidden: [], themes: m.themes, links: m.links.map((l, i) => Object.assign({id: 'l' + i + '-' + rid}, l)), threads: m.threads};
    st.mapSel = null;
    saveMap();
    toast('Mapped ' + plural(ctx.length, 'document') + ' · ' + plural(m.links.length, 'link'));
  } catch (err) {
    if (!(err && err.code === 'cancelled')) { st.mapErr = err; noteAiError(err); }
  } finally {
    clearInterval(tick); st.mapRun = null; renderMap();
  }
}
function updateMapProgress() {
  const a = $('#mtitle'), b = $('#mtime'), R = st.mapRun; if (!R) return;
  const s = Math.floor((Date.now() - R.t0) / 1000);
  if (a) a.textContent = R.stage || 'Starting…';
  if (b) b.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// ---- the view ----
function renderMap() {
  if (st.mode !== 'map') return;
  const M = st.rmap, docs = mapDocs(), byId = new Map(docs.map(d => [d.id, d])), kids = [];
  kids.push(h('div', {class: 'mhead'}, h('h2', null, 'Research map'),
    h('p', {class: 'mintro'}, 'How your essays and the sources they use connect. Click a line to read the two passages side by side.')));
  if (st.mapRun) kids.push(h('section', {class: 'prog', 'aria-live': 'polite'}, h('div', {class: 'pbar'}, h('i')),
    h('div', {class: 'ptxt'}, h('b', {id: 'mtitle'}, st.mapRun.stage || 'Starting…'), h('span', {id: 'mtime'}, '0:00')),
    h('button', {class: 'btn sm', onclick: () => st.mapRun && st.mapRun.ctl.abort()}, 'Stop')));
  if (st.mapErr) kids.push(h('section', {class: 'errc', role: 'alert'}, h('b', null, 'The map didn’t finish'),
    h('p', null, st.mapErr.code === 'prompt_too_large' ? 'Your library is too big to map in one go. Delete or shorten some documents.' : errText(st.mapErr)),
    isHard(st.mapErr) ? null : h('button', {class: 'btn sm', onclick: runMap}, 'Try again')));
  if (!M) { if (!st.mapRun) kids.push(mapEmptyEl(docs)); fill(mapEl, kids); return; }
  const links = M.links.filter(l => byId.has(l.from) && byId.has(l.to) && !M.hidden.includes(l.id));
  const shown = links.filter(l => st.mapFilter === 'all' || MAP_KIND[l.kind].group === st.mapFilter);
  if (M.sig !== mapSig(docs)) kids.push(h('div', {class: 'astale', role: 'status'}, h('span', null, 'Your library has changed since this map.'),
    h('button', {class: 'btn sm', onclick: runMap, disabled: !!st.mapRun}, 'Map again')));
  kids.push(h('div', {class: 'mbar', role: 'group', 'aria-label': 'Show links'}, MAP_FILTERS.map(([k, name]) => {
    const n = k === 'all' ? links.length : links.filter(l => MAP_KIND[l.kind].group === k).length;
    return h('button', {type: 'button', class: 'chip', 'aria-pressed': String(st.mapFilter === k), onclick: () => { st.mapFilter = k; st.mapSel = null; renderMap(); }}, name, h('span', {class: 'n'}, n));
  })));
  // Themes as Claude grouped them; anything added since sits in its own group until the next map.
  const placed = new Set(), groups = [];
  for (const t of M.themes) { const ds = t.docs.filter(id => byId.has(id) && !placed.has(id)); ds.forEach(id => placed.add(id)); if (ds.length) groups.push({name: t.name, docs: ds}); }
  const rest = docs.filter(d => !placed.has(d.id)).map(d => d.id);
  if (rest.length) groups.push({name: 'Not mapped yet', docs: rest, later: true});
  kids.push(h('div', {class: 'mcanvas', id: 'mcanvas'}, sv('svg', {class: 'mlines', 'aria-hidden': 'true'}), h('div', {class: 'mlabels', role: 'group', 'aria-label': 'Links'}),
    h('div', {class: 'mthemes'}, groups.map(g => h('section', {class: 'mtheme' + (g.later ? ' later' : ''), 'aria-label': g.name}, h('h3', null, g.name),
      h('div', {class: 'mnodes'}, g.docs.map(id => byId.get(id)).sort((a, b) => (a.role === 'source') - (b.role === 'source')).map(mapNodeEl)))))));
  const sel = st.mapSel, selLink = sel && sel.link ? links.find(l => l.id === sel.link) : null, selNode = sel && sel.node ? byId.get(sel.node) : null;
  if (selLink) kids.push(linkPanelEl(selLink, byId));
  else if (selNode) kids.push(nodePanelEl(selNode, links, byId));
  kids.push(threadsEl(M, byId));
  kids.push(h('p', {class: 'smeta'}, 'Mapped by Claude · ' + ago(M.at) + ' · ', h('button', {class: 'lnk', onclick: runMap, disabled: !!st.mapRun}, 'Map again')));
  fill(mapEl, kids);
  drawMapLines(shown);
}
function mapNodeEl(d) {
  const isSrc = d.role === 'source', users = isSrc ? essayDocs().filter(e => isUsed(e, d)).length : 0, ix = d.index;
  const notes = !isSrc && d.review ? d.review.issues.filter(is => !(d.marks || {})[is.id]).length : null;
  const by = ix ? [ix.meta.authors, ix.meta.year].filter(Boolean).join(', ') : '';
  const meta = isSrc ? [by, users ? 'used by ' + plural(users, 'essay') : 'not in any review'].filter(Boolean).join(' · ')
    : plural(words(d.text), 'word') + (notes != null ? ' · ' + plural(notes, 'open note') : '');
  const on = !!(st.mapSel && st.mapSel.node === d.id);
  return h('button', {type: 'button', class: 'mnode ' + (isSrc ? 'src' : 'ess') + (on ? ' on' : '') + (d === st.cur ? ' cur' : '') + (isSrc && !users ? ' off' : ''),
      data: {id: d.id}, 'aria-pressed': String(on), onclick: () => { st.mapSel = on ? null : {node: d.id}; renderMap(); }},
    h('span', {class: 'mic', html: isSrc ? BOOK_ICON : DOC_ICON}), h('span', {class: 'mtitle'}, d.title || 'Untitled'), h('span', {class: 'mmeta'}, meta));
}
// Lines run under the cards. Cards in the same row are joined by an arc over the top, cards in the same column by a
// line down the gap beside them, and the rest by a gentle bow that leaves each card at its edge. Each line's label is a
// small button above everything (so every link can be chosen by mouse or keyboard), placed clear of cards and labels.
function drawMapLines(links) {
  const cv = $('#mcanvas'); if (!cv) return;
  const svg = cv.querySelector('svg.mlines'), labs = cv.querySelector('.mlabels'), box = cv.getBoundingClientRect(), placed = [], lanes = new Map();
  const cards = [...cv.querySelectorAll('.mnode')].map(el => { const r = el.getBoundingClientRect(); return {x: r.left - box.left - 4, y: r.top - box.top - 4, w: r.width + 8, h: r.height + 8}; });
  const hits = (x, y) => cards.some(c => x + 34 > c.x && x - 34 < c.x + c.w && y + 11 > c.y && y - 11 < c.y + c.h) || placed.some(p => Math.abs(p.x - x) < 70 && Math.abs(p.y - y) < 22);
  const spot = (x, y) => { for (const dy of [0, -24, 24, -48, 48, -72, 72]) if (!hits(x, y + dy)) return {x, y: y + dy}; return {x, y}; };
  svg.replaceChildren(); labs.replaceChildren(); svg.setAttribute('width', Math.round(box.width)); svg.setAttribute('height', Math.round(box.height));
  const rect = id => { const el = cv.querySelector('.mnode[data-id="' + id + '"]'); if (!el) return null; const r = el.getBoundingClientRect(); return {x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height}; };
  const edge = (R, p) => {
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2, dx = p.x - cx, dy = p.y - cy;
    const s = Math.min(dx ? R.w / 2 / Math.abs(dx) : Infinity, dy ? R.h / 2 / Math.abs(dy) : Infinity);
    return isFinite(s) ? {x: cx + dx * s, y: cy + dy * s} : {x: cx, y: cy};
  };
  const byId = new Map(mapDocs().map(d => [d.id, d]));
  links.forEach((l, i) => {
    const A = rect(l.from), B = rect(l.to); if (!A || !B) return;
    const ca = {x: A.x + A.w / 2, y: A.y + A.h / 2}, cb = {x: B.x + B.w / 2, y: B.y + B.h / 2};
    const f = v => v.toFixed(1), sameCol = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x) > Math.min(A.w, B.w) * 0.5;
    let d, mid;
    if (Math.abs(ca.y - cb.y) < 14) {
      const pa = {x: ca.x, y: A.y}, pb = {x: cb.x, y: B.y}, c = {x: (pa.x + pb.x) / 2, y: Math.min(pa.y, pb.y) - Math.min(76, 30 + Math.abs(pb.x - pa.x) * 0.12)};
      d = `M${f(pa.x)} ${f(pa.y)}Q${f(c.x)} ${f(c.y)} ${f(pb.x)} ${f(pb.y)}`; mid = {x: c.x, y: (pa.y + c.y) / 2};
    } else if (sameCol) {
      const right = Math.round(Math.max(A.x + A.w, B.x + B.w)), lane = lanes.get(right) || 0, gx = right + 12 + lane * 8, r = 8;
      lanes.set(right, lane + 1);
      const ay = ca.y, by = cb.y, s = by > ay ? 1 : -1;
      d = `M${f(A.x + A.w)} ${f(ay)}H${f(gx - r)}Q${f(gx)} ${f(ay)} ${f(gx)} ${f(ay + s * r)}V${f(by - s * r)}Q${f(gx)} ${f(by)} ${f(gx - r)} ${f(by)}H${f(B.x + B.w)}`;
      mid = {x: gx, y: (ay + by) / 2};
    } else {
      const pa = edge(A, cb), pb = edge(B, ca), dx = pb.x - pa.x, dy = pb.y - pa.y, len = Math.hypot(dx, dy) || 1, bow = (i % 2 ? 1 : -1) * Math.min(36, len * 0.14);
      const c = {x: (pa.x + pb.x) / 2 - dy / len * bow, y: (pa.y + pb.y) / 2 + dx / len * bow};
      d = `M${f(pa.x)} ${f(pa.y)}Q${f(c.x)} ${f(c.y)} ${f(pb.x)} ${f(pb.y)}`; mid = {x: 0.25 * pa.x + 0.5 * c.x + 0.25 * pb.x, y: 0.25 * pa.y + 0.5 * c.y + 0.25 * pb.y};
    }
    const on = !!(st.mapSel && st.mapSel.link === l.id), K = MAP_KIND[l.kind];
    const pick = () => { st.mapSel = on ? null : {link: l.id}; renderMap(); const p = $('.mdetail'); if (p && !on) p.scrollIntoView({block: 'nearest', behavior: 'smooth'}); };
    const g = sv('g', {class: 'mlink k-' + l.kind + (on ? ' on' : ''), 'data-id': l.id});
    g.append(sv('path', {class: 'ml', d}), sv('path', {class: 'hit', d}));
    g.addEventListener('click', pick);
    svg.append(g);
    const at = spot(mid.x, mid.y);
    placed.push(at);
    labs.append(h('button', {type: 'button', class: 'mlab k-' + l.kind + (on ? ' on' : ''), style: 'left:' + f(at.x) + 'px;top:' + f(at.y) + 'px', 'aria-pressed': String(on),
      'aria-label': (byId.get(l.from).title || 'Untitled') + ' ' + K.label + ' ' + (byId.get(l.to).title || 'Untitled'),
      onclick: pick, onmouseenter: () => g.classList.add('hov'), onmouseleave: () => g.classList.remove('hov')}, K.short));
  });
}
function linkTitle(l, A, B) {
  const ess = d => d.role !== 'source';
  if (l.kind === 'clash') return ess(A) && ess(B) ? 'a clash between two of your essays' : 'a clash with a source';
  if (l.kind === 'supports') return ess(B) ? 'support for your essay' : 'one source supporting another';
  if (l.kind === 'critiques') return 'a critique';
  return l.kind === 'cites' ? 'a source your essay relies on' : 'an idea carried forward';
}
function sideEl(d, q, c) {
  const p = paraOf(d, q);
  return h('button', {type: 'button', class: 'q mq', style: '--tc:var(' + c + ')', onclick: () => openAt(d, q)},
    h('span', {class: 'ql'}, (d.title || 'Untitled') + (p ? ' · ¶' + p : '') + ' · open'), h('span', {class: 'qt'}, q ? '“' + trunc(q, 280) + '”' : 'The work as a whole'));
}
function linkPanelEl(l, byId) {
  const A = byId.get(l.from), B = byId.get(l.to), K = MAP_KIND[l.kind];
  return h('section', {class: 'mdetail', 'aria-live': 'polite'},
    h('span', {class: 'lbl'}, 'Selected · ' + linkTitle(l, A, B)),
    h('div', {class: 'mpair'}, sideEl(A, l.qa, K.c), sideEl(B, l.qb, K.c)),
    l.note ? h('p', {class: 'mnote'}, l.note) : null,
    l.fix ? h('p', {class: 'mnote'}, h('b', null, 'Try: '), l.fix) : null,
    h('div', {class: 'acts'},
      h('button', {class: 'btn sm primary', type: 'button', onclick: () => openBoth(l, byId)}, 'Open both side by side'),
      h('button', {class: 'btn sm', type: 'button', onclick: () => brainstormFrom(l.kind === 'clash' ? 'Can both be true? ' + (l.note || '') : l.note || linkTitle(l, A, B), [A, B], [[A, l.qa], [B, l.qb]])}, 'Brainstorm this'),
      h('button', {class: 'btn sm ghost', type: 'button', onclick: () => { st.rmap.hidden.push(l.id); st.mapSel = null; saveMap(); renderMap(); }}, l.kind === 'clash' ? 'Not a clash' : 'Hide this link')));
}
function nodePanelEl(d, links, byId) {
  const isSrc = d.role === 'source', mine = links.filter(l => l.from === d.id || l.to === d.id), others = essayDocs().filter(e => e.id !== d.id);
  return h('section', {class: 'mdetail', 'aria-live': 'polite'},
    h('span', {class: 'lbl'}, 'Selected · ' + (isSrc ? 'a source' : 'one of your essays')),
    h('h3', null, d.title || 'Untitled'),
    mine.length ? h('ul', {class: 'mrel'}, mine.map(l => h('li', {style: '--tc:var(' + MAP_KIND[l.kind].c + ')'}, h('i', {class: 'dot'}),
      h('button', {class: 'lnk', type: 'button', onclick: () => { st.mapSel = {link: l.id}; renderMap(); }},
        (byId.get(l.from).title || 'Untitled') + ' ' + MAP_KIND[l.kind].label + ' ' + (byId.get(l.to).title || 'Untitled')))))
      : h('p', {class: 'khint'}, 'No links found to the rest of your work yet.'),
    h('div', {class: 'acts'},
      h('button', {class: 'btn sm primary', type: 'button', onclick: () => openAt(d, null)}, 'Open'),
      isSrc ? null : h('button', {class: 'btn sm', type: 'button', onclick: () => { openDoc(d); setMode('write'); setView('argument'); }}, 'See its argument flow'),
      isSrc ? null : h('button', {class: 'btn sm', type: 'button', onclick: () => { openDoc(d); setMode('plan'); }}, 'Brainstorm')),
    others.length ? h('div', {class: 'mswitches'}, h('span', {class: 'lbl'}, isSrc ? 'Used in reviews of' : 'Checked in reviews of'),
      others.map(e => { const on = isUsed(e, d); return h('div', {class: 'mswitch'},
        h('button', {class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': (on ? 'Stop using “' : 'Use “') + (d.title || 'Untitled') + '” in reviews of “' + (e.title || 'Untitled') + '”',
          onclick: () => { setUsed(e, d, !on); renderMap(); }}, h('span', {class: 'knob'})), h('span', null, e.title || 'Untitled')); })) : null);
}
function threadsEl(M, byId) {
  const T = M.threads.map(t => Object.assign({}, t, {docs: t.docs.filter(id => byId.has(id))})).filter(t => t.docs.length);
  if (!T.length) return null;
  return h('section', {class: 'mthreads', 'aria-label': 'Open threads'}, h('h3', null, 'Open threads across your work'),
    h('p', {class: 'khint'}, 'Questions your essays raise but never settle.'),
    h('ul', null, T.map(t => h('li', null, h('div', {class: 'mtx'}, h('p', {class: 'mq2'}, t.q), t.note ? h('p', {class: 'khint'}, t.note) : null,
      h('p', {class: 'mdocs'}, t.docs.map(id => byId.get(id).title || 'Untitled').join(' · '))),
      h('button', {class: 'btn sm', type: 'button', onclick: () => brainstormFrom(t.q, t.docs.map(id => byId.get(id)), [])}, 'Brainstorm')))));
}
function mapSketch() {
  const s = sv('svg', {class: 'sketch', width: 64, height: 64, viewBox: '0 0 64 64', 'aria-hidden': 'true'});
  s.append(sv('path', {class: 'seg', d: 'M14 16Q34 8 50 20M14 16Q12 34 22 48M50 20Q48 40 22 48'}));
  for (const [x, y, c] of [[14, 16, '--ink'], [50, 20, '--evid'], [22, 48, '--rel']]) s.append(sv('circle', {class: 'dot', cx: x, cy: y, r: 6, style: '--rc:var(' + c + ')'}));
  return s;
}
function mapEmptyEl(docs) {
  const nE = docs.filter(d => d.role !== 'source').length, nS = docs.length - nE, off = st.ai === 'denied' || st.ai === 'off';
  if (docs.length < 2) return h('section', {class: 'empty mempty'}, mapSketch(), h('div', null, h('h3', null, 'Map how your work connects'),
    h('p', null, 'Add at least two essays or sources, and Claude will map how they connect: what builds on what, what supports what, and where they clash.'),
    h('div', {class: 'acts'}, h('button', {class: 'btn sm', type: 'button', onclick: () => pickFiles('essay')}, 'Upload essays'), h('button', {class: 'btn sm', type: 'button', onclick: () => pickFiles('source')}, 'Add sources'))));
  return h('section', {class: 'empty mempty'}, mapSketch(), h('div', null,
    h('h3', null, 'Map how your work connects'),
    h('p', null, 'Claude reads the main claims of your ' + [nE ? plural(nE, 'essay') : '', nS ? plural(nS, 'source') : ''].filter(Boolean).join(' and ') +
      ', groups them by theme, and draws what builds on, supports or clashes with what, down to the passage. It also lists the questions your work raises but never settles.'),
    h('div', {class: 'acts'}, h('button', {class: 'btn sm primary', type: 'button', id: 'mapRunBtn', onclick: runMap, disabled: off || !!st.mapRun}, 'Map my work')),
    h('p', {class: 'fine'}, off && st.aiWhy ? st.aiWhy : 'Uses your Claude plan. Long documents are read once and remembered.')));
}

// ---- from the map to the work ----
function openAt(d, q) {
  if (d.role === 'source') { openReader(d, q); return; }
  if (st.cur !== d) openDoc(d);
  setMode('write');
  const r = q ? anchorFuzzy(ed.value, q) : null;
  if (r) requestAnimationFrame(() => scrollToRange(r, 0.3));
}
// An essay in the editor, the other side in the reader beside it.
function openBoth(l, byId) {
  const A = byId.get(l.from), B = byId.get(l.to), main = A.role !== 'source' ? [A, l.qa, B, l.qb] : B.role !== 'source' ? [B, l.qb, A, l.qa] : null;
  if (!main) { openReader(A, l.qa); return; }
  openAt(main[0], main[1]);
  openReader(main[2], main[3]);
}
// Start a brainstorm on the first essay involved: the question, plus the passages as source cards.
function brainstormFrom(question, docs, passages) {
  const e = docs.find(d => d && d.role !== 'source') || (st.cur && st.cur.role !== 'source' ? st.cur : essayDocs()[0]);
  if (!e) { toast('Open an essay to brainstorm in.'); return; }
  openDoc(e); setMode('plan');
  const P = planOf(e);
  if (!P.q) P.q = clip(question, 600);
  const cards = [{kind: 'question', text: clip(question, 280)}].concat(passages.filter(([d, q]) => d && q).map(([d, q]) =>
    ({kind: 'source', text: 'From “' + clip(d.title || 'Untitled', 80) + '”', src: {id: d.id, title: clip(d.title || 'Untitled', 200), quote: clip(q, 600)}})));
  // Asking twice doesn't add the same cards twice.
  const fresh = cards.filter(x => !P.cards.some(c => c.kind === x.kind && c.text === x.text && (!x.src || (c.src && c.src.quote === x.src.quote))));
  if (fresh.length) addCards(fresh, e); else renderBoard();
}
let mapRAF = 0;
addEventListener('resize', () => { if (st.mode === 'map' && st.rmap && !mapRAF) mapRAF = requestAnimationFrame(() => { mapRAF = 0; renderMap(); }); });
