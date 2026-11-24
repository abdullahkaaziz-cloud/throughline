// ---- text helpers (shared by the page and the Node tests) ----
const QMAP = {'‘':"'",'’':"'",'‚':"'",'‛':"'",'′':"'",'“':'"','”':'"','„':'"','″':'"','–':'-','—':'-','−':'-','‹':'<','›':'>'};
function normMap(s) {
  let t = '', sp = false; const map = [];
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (c === '​' || c === '­') continue;
    if (/\s/.test(c)) { if (sp) continue; sp = true; t += ' '; map.push(i); continue; }
    sp = false; t += QMAP[c] || c; map.push(i);
  }
  return {t, map};
}
function cleanQuote(q) {
  return String(q == null ? '' : q).trim()
    .replace(/^\[\d+\]\s*/, '')
    .replace(/^["'“”‘’]+(?=\S)/, '').replace(/(?<=\S)["“”]+$/, '')
    .replace(/^(\.\.\.|…)\s*/, '').replace(/\s*(\.\.\.|…)$/, '').trim();
}
function findAll(hay, needle) {
  const out = []; if (!needle) return out;
  let i = hay.indexOf(needle);
  while (i >= 0 && out.length < 60) { out.push(i); i = hay.indexOf(needle, i + 1); }
  return out;
}
function nearest(list, hint) {
  if (!list.length) return -1;
  if (hint == null) return list[0];
  return list.reduce((b, x) => Math.abs(x - hint) < Math.abs(b - hint) ? x : b);
}
function anchorExact(text, q, hint) {
  if (!q) return null;
  const i = nearest(findAll(text, q), hint);
  return i < 0 ? null : [i, i + q.length];
}
function normIndex(N, orig) {
  let lo = 0, hi = N.map.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (N.map[mid] < orig) lo = mid + 1; else hi = mid; }
  return lo;
}
// Find a quote the model gave us, tolerating curly quotes, dashes, spacing, case and ellipses.
function anchorFuzzy(text, quote, hint, N) {
  const raw = String(quote == null ? '' : quote).trim();
  if (raw.length > 1) { const r0 = anchorExact(text, raw, hint); if (r0) return r0; }
  const q = cleanQuote(quote); if (q.length < 2) return null;
  const ex = anchorExact(text, q, hint); if (ex) return ex;
  N = N || normMap(text);
  const nq = normMap(q).t.trim(); if (!nq) return null;
  const back = (a, b) => [N.map[a], N.map[b - 1] + 1];
  const nh = hint == null ? null : normIndex(N, hint);
  let hits = findAll(N.t, nq);
  if (!hits.length) hits = findAll(N.t.toLowerCase(), nq.toLowerCase());
  if (hits.length) { const i = nearest(hits, nh); return back(i, i + nq.length); }
  const frags = nq.split(/\s*(?:\.\.\.|…)\s*/).filter(f => f.length > 3);
  if (frags.length > 1) {
    for (const s0 of findAll(N.t, frags[0])) {
      let pos = s0 + frags[0].length, ok = true;
      for (const f of frags.slice(1)) { const k = N.t.indexOf(f, pos); if (k < 0 || k - pos > 400) { ok = false; break; } pos = k + f.length; }
      if (ok) return back(s0, pos);
    }
  }
  const w = nq.split(' ');
  if (w.length >= 8) {
    const head = w.slice(0, 5).join(' '), tail = w.slice(-5).join(' ');
    for (const h0 of findAll(N.t, head)) {
      const t0 = N.t.indexOf(tail, h0 + head.length);
      if (t0 > 0 && t0 + tail.length - h0 <= nq.length * 1.6) return back(h0, t0 + tail.length);
    }
  }
  return null;
}
function paraStarts(text) {
  const s = []; let i = 0;
  for (const line of text.split('\n')) { if (line.trim()) s.push(i); i += line.length + 1; }
  return s;
}
function paraIndex(starts, off) {
  let lo = 0, hi = starts.length - 1, ans = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= off) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans + 1;
}
const CONNECT = /\b(of|the|and|in|on|to|a|an|for|with|from|or|at|by)$/i;
// Join hard-wrapped lines (PDF text) back into paragraphs.
function reflow(lines) {
  const lens = lines.map(s => (s || '').trim().length).filter(n => n > 0).sort((a, b) => a - b);
  const wide = lens.length ? lens[Math.floor(lens.length * 0.9)] : 80;
  const out = []; let buf = '', headOpen = false;
  const flush = () => { const t = buf.replace(/\s+/g, ' ').trim(); if (t) out.push(t); buf = ''; };
  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').replace(/\s+/g, ' ').trim();
    if (!line) { flush(); headOpen = false; continue; }
    if (/^\d{1,3}$/.test(line)) continue;
    const short = line.length < wide * 0.72;
    const ends = /[.!?:;"”’)\]]$/.test(line);
    const headLike = short && !ends && !/,$/.test(line) && /^[\p{Lu}\d"“‘'(]/u.test(line);
    if (headOpen && !headLike) { flush(); headOpen = false; }
    if (/^(\(?\d{1,2}[.)]\s|[•▪◦]\s?)/.test(line)) flush();
    if (buf && /[A-Za-z]-$/.test(buf) && /^[a-z]/.test(line)) buf = buf.slice(0, -1) + line;
    else buf = buf ? buf + ' ' + line : line;
    if (headLike && (headOpen || buf === line)) {
      if (CONNECT.test(line)) { headOpen = true; continue; }
      headOpen = false; flush(); continue;
    }
    if (short && ends) flush();
  }
  flush();
  return out;
}
// Plain text from a file or paste: one paragraph per line, blank line between.
function tidyText(raw) {
  const t = String(raw || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/[ \t]+$/gm, '');
  const lines = t.split('\n'), filled = lines.filter(l => l.trim());
  if (!filled.length) return '';
  const blanks = lines.length - filled.length;
  const med = filled.map(l => l.length).sort((a, b) => a - b)[Math.floor(filled.length / 2)];
  let paras;
  if (blanks >= filled.length * 0.2 && med < 110) paras = reflow(lines);
  else if (blanks >= filled.length * 0.2) paras = t.split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim());
  else if (med < 110 && filled.length > 8) paras = reflow(lines);
  else paras = filled.map(l => l.trim());
  return paras.filter(Boolean).join('\n\n');
}
function wordDiff(a, b) {
  const A = a.match(/\S+\s*|\s+/g) || [], B = b.match(/\S+\s*|\s+/g) || [];
  if (A.length * B.length > 120000) return [['+', b]];
  const n = A.length, m = B.length, dp = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [], push = (k, s) => { const l = out[out.length - 1]; if (l && l[0] === k) l[1] += s; else out.push([k, s]); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push('=', A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push('-', A[i++]);
    else push('+', B[j++]);
  }
  while (i < n) push('-', A[i++]);
  while (j < m) push('+', B[j++]);
  const same = out.filter(x => x[0] === '=').reduce((k, x) => k + x[1].length, 0);
  return same < Math.max(a.length, b.length) * 0.45 ? [['+', b]] : out;
}
function words(t) { return (String(t).match(/\S+/g) || []).length; }
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

// ---- data hygiene: ids, stored values, prompt fences ----
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function safeId(s) { return typeof s === 'string' && ID_RE.test(s) && s !== '__proto__' && s !== 'constructor' && s !== 'prototype'; }
// Plain text without control characters (tabs and line breaks stay), trimmed and capped.
function clip(v, max) {
  return (v == null ? '' : String(v)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
function plainObj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
// id -> value map with no prototype, keeping only safe ids and allowed values (booleans by default).
function cleanFlags(x, allowed) {
  const out = Object.create(null), src = plainObj(x);
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (safeId(k) && (allowed ? allowed.includes(v) : typeof v === 'boolean')) out[k] = v;
  }
  return out;
}
// Text placed inside a prompt block can't close that block or open another one.
function fence(text) {
  return String(text == null ? '' : text).replace(/<(?=\s*\/?\s*(?:document|brief|essay|claims|plan|question|notes|answer)\b)/gi, '\u2039');
}

// ---- review context: what goes into the prompt, and checking what comes back ----
// items, most important first: {id, fullBytes, claimsBytes (null when the document has no claims index)}.
// Each gets its smaller form if it fits the budget; then documents are upgraded to full text, smallest first.
function planContext(items, budget, fullMax) {
  const plan = new Map(); let used = 0;
  for (const it of items) {
    const claims = it.claimsBytes != null && it.claimsBytes < it.fullBytes;
    const size = claims ? it.claimsBytes : it.fullBytes;
    if ((!claims && it.fullBytes > fullMax) || used + size > budget) continue;
    plan.set(it.id, claims ? 'claims' : 'full'); used += size;
  }
  for (const it of items.filter(x => plan.get(x.id) === 'claims').sort((a, b) => a.fullBytes - b.fullBytes)) {
    const extra = it.fullBytes - it.claimsBytes;
    if (it.fullBytes <= fullMax && used + extra <= budget) { plan.set(it.id, 'full'); used += extra; }
  }
  return {plan, used};
}
// A claims index from the model, kept only where each quote really is in the document.
function validateIndex(raw, text) {
  const r = plainObj(raw), m = plainObj(r.meta), N = normMap(text), starts = paraStarts(text), claims = [], seen = new Set();
  for (const c of (Array.isArray(r.claims) ? r.claims : []).slice(0, 40)) {
    const o = plainObj(c), at = anchorFuzzy(text, o.quote, null, N);
    if (!at || at[1] - at[0] > 600 || seen.has(at[0])) continue;
    seen.add(at[0]);
    claims.push({id: 'c' + (claims.length + 1), claim: clip(o.claim, 300) || clip(text.slice(at[0], at[1]), 300),
      quote: text.slice(at[0], at[1]), para: paraIndex(starts, at[0]), topic: clip(o.topic, 40)});
    if (claims.length >= 24) break;
  }
  return {meta: {authors: clip(m.authors, 160), year: clip(m.year, 12), summary: clip(m.summary, 400)}, claims};
}
// Where a passage the model cites sits in another document: by claim id first, then by quote.
function locateInDoc(d, ref) {
  const o = plainObj(ref);
  if (o.claim != null && Array.isArray(d.claims)) {
    const c = d.claims.find(x => x.id === String(o.claim));
    if (c) { const r = anchorExact(d.text, c.quote); if (r) return r; }
  }
  return o.quote ? anchorFuzzy(d.text, o.quote) : null;
}
const SEVS = ['high', 'medium', 'low'], BRIEF_STATES = ['covered', 'partial', 'missing'];
const TYPE_ALIASES = {library: 'library_clash', clash: 'library_clash', library_conflict: 'library_clash', source: 'source_conflict', source_clash: 'source_conflict', misattribution: 'citation', misquote: 'citation'};
// The model's review, checked against the text: every quote must be found, every type known, every value bounded.
// o: {text, types: {name: {rel, src}}, resolveDoc(ref) -> {id, title, text, claims, role} | null, rid}
function parseReview(raw, o) {
  const text = o.text, N = normMap(text), r = plainObj(raw), issues = [], seen = new Set();
  const list = Array.isArray(raw) ? raw : Array.isArray(r.issues) ? r.issues : [];
  list.slice(0, 40).forEach((it, k) => {
    const x = plainObj(it), pa = plainObj(x.passage_a), pb = plainObj(x.passage_b);
    let type = clip(x.type, 40).toLowerCase().replace(/[\s-]+/g, '_');
    if (hasOwn(TYPE_ALIASES, type)) type = TYPE_ALIASES[type];
    if (!hasOwn(o.types, type)) return;
    const a = anchorFuzzy(text, pa.quote != null ? pa.quote : x.quote, null, N);
    if (!a || a[1] - a[0] > 1500) return;
    const sev = clip(x.severity, 10).toLowerCase(), conf = Number(x.confidence);
    const rec = {id: 'n' + k + '-' + o.rid, type, severity: SEVS.includes(sev) ? sev : 'medium',
      confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : null, title: clip(x.title, 90),
      qa: text.slice(a[0], a[1]), qb: null, docB: null, explanation: clip(x.explanation, 700), fix: clip(x.fix, 500),
      suggestion: typeof x.suggestion === 'string' && x.suggestion.trim() ? x.suggestion.slice(0, 2000) : null};
    if (o.types[type].rel) {
      const b = anchorFuzzy(text, pb.quote, null, N);
      if (!b || (b[0] < a[1] && a[0] < b[1])) return;
      rec.qb = text.slice(b[0], b[1]);
    } else if (o.types[type].src) {
      const d = o.resolveDoc(pb.document);
      if (d) {
        if (type === 'library_clash' && d.role === 'source') rec.type = 'source_conflict';
        else if (type === 'source_conflict' && d.role === 'essay') rec.type = 'library_clash';
        const b = locateInDoc(d, pb);
        if (b) rec.qb = d.text.slice(b[0], b[1]);
        rec.docB = {id: d.id, title: d.title};
      }
      if (rec.type !== 'citation' && !rec.qb) return;
    }
    if (rec.confidence != null && rec.confidence < 0.3) return;
    const key = rec.type + ':' + a[0] + ':' + a[1];
    if (seen.has(key)) return;
    seen.add(key);
    if (rec.suggestion === rec.qa) rec.suggestion = null;
    issues.push(rec);
  });
  const links = [];
  for (const l of (Array.isArray(r.links) ? r.links : []).slice(0, 30)) {
    const x = plainObj(l);
    if (clip(x.relation, 20).toLowerCase() !== 'supports') continue;
    const a = anchorFuzzy(text, x.quote != null ? x.quote : plainObj(x.passage_a).quote, null, N), d = a && o.resolveDoc(x.document);
    const b = d && locateInDoc(d, {claim: x.claim, quote: x.source_quote});
    if (b) links.push({qa: text.slice(a[0], a[1]), qb: d.text.slice(b[0], b[1]), docB: {id: d.id, title: d.title}});
    if (links.length >= 12) break;
  }
  const brief = [];
  for (const b of (Array.isArray(r.brief) ? r.brief : []).slice(0, 8)) {
    const x = plainObj(b), req = clip(x.requirement, 160);
    if (!req) continue;
    const status = clip(x.status, 12).toLowerCase(), a = x.quote ? anchorFuzzy(text, x.quote, null, N) : null;
    brief.push({requirement: req, status: BRIEF_STATES.includes(status) ? status : 'partial', qa: a ? text.slice(a[0], a[1]) : null, note: clip(x.note, 300)});
  }
  const s = plainObj(r.summary);
  return {summary: {thesis: clip(s.thesis, 400), start_with: clip(s.start_with, 400)}, issues, links, brief};
}

// ---- argument map: what each paragraph does, and how the argument hangs together ----
const ARG_ROLES = ['thesis', 'claim', 'evidence', 'counter', 'rebuttal', 'context', 'conclusion', 'heading', 'aside'];
const ARG_PROBLEMS = ['dropped', 'circular', 'gap', 'unanswered'];
function paraList(v, n, self) {
  const out = [];
  for (const x of Array.isArray(v) ? v : []) {
    const k = Number(x);
    if (Number.isInteger(k) && k >= 1 && k <= n && k !== self && !out.includes(k)) out.push(k);
    if (out.length >= 6) break;
  }
  return out;
}
// The model's map, checked against the essay: paragraph numbers in range, known roles and problem kinds, bounded text.
function validateArgmap(raw, text) {
  const r = plainObj(raw), n = paraStarts(text).length, byPara = new Map();
  for (const x of (Array.isArray(r.paras) ? r.paras : []).slice(0, 800)) {
    if (byPara.size >= 400) break;
    const o = plainObj(x), p = Number(o.para);
    if (!Number.isInteger(p) || p < 1 || p > n || byPara.has(p)) continue;
    const role = clip(o.role, 20).toLowerCase(), th = Number(o.thread);
    byPara.set(p, {para: p, role: ARG_ROLES.includes(role) ? role : 'context', point: clip(o.point, 140),
      thread: Number.isFinite(th) ? Math.max(0, Math.min(1, th)) : 0.5, supports: paraList(o.supports, n, p), answers: paraList(o.answers, n, p)});
  }
  const problems = [];
  for (const x of (Array.isArray(r.problems) ? r.problems : []).slice(0, 12)) {
    const o = plainObj(x), kind = clip(o.kind, 20).toLowerCase(), ps = paraList(o.paras, n, 0).slice(0, 4);
    if (ARG_PROBLEMS.includes(kind) && ps.length) problems.push({kind, paras: ps, note: clip(o.note, 220)});
    if (problems.length >= 8) break;
  }
  const t = plainObj(r.thesis), at = t.quote ? anchorFuzzy(text, t.quote) : null;
  return {n, thesis: {text: clip(t.text, 300), quote: at ? text.slice(at[0], at[1]) : null}, paras: [...byPara.values()].sort((a, b) => a.para - b.para), problems};
}

// ---- brainstorm cards ----
const IDEA_KINDS = ['angle', 'objection', 'question', 'source'];
const ideaKey = t => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// The model's ideas, checked: known kinds, short text, nothing the writer already has, and source cards
// only when their passage is really in that document. o: {resolveDoc(ref) -> {id, title, text, claims} | null, have: [text]}
function validateIdeas(raw, o) {
  const r = plainObj(raw), opt = plainObj(o), out = [], seen = new Set((Array.isArray(opt.have) ? opt.have : []).map(ideaKey));
  for (const x of (Array.isArray(r.cards) ? r.cards : []).slice(0, 40)) {
    const c = plainObj(x), kind = clip(c.kind, 20).toLowerCase(), text = clip(c.text, 280), key = ideaKey(text);
    if (!IDEA_KINDS.includes(kind) || !key || seen.has(key)) continue;
    const card = {kind, text, src: null};
    if (kind === 'source') {
      const d = typeof opt.resolveDoc === 'function' ? opt.resolveDoc(c.document) : null, at = d ? locateInDoc(d, {claim: c.claim, quote: c.quote}) : null;
      if (!at) continue;
      card.src = {id: d.id, title: clip(d.title, 200), quote: d.text.slice(at[0], at[1]).slice(0, 600)};
    }
    seen.add(key); out.push(card);
    if (out.length >= 16) break;
  }
  return out;
}

// ---- drafts: paragraph fingerprints, lining two drafts up, matching notes across reviews ----
function textParas(text) { return String(text == null ? '' : text).split('\n').map(x => x.trim()).filter(Boolean); }
const paraHash = p => hash(p) + p.length.toString(36);
const noteKey = (type, quote) => type + ':' + String(quote || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 80);
// The first sentence of a paragraph, at most `max` words: how a re-check shows paragraphs it doesn't need in full.
function gist(p, max) {
  const n = max || 24, first = (String(p).match(/^[\s\S]*?[.!?](?=\s|$)/) || [String(p)])[0].trim(), w = first.split(/\s+/).filter(Boolean);
  return w.length > n ? w.slice(0, n).join(' ') + '…' : first;
}
// Line up two drafts by paragraph fingerprints: unchanged paragraphs match (longest common run), and the edited
// ones between them pair up in order. Returns [{a, b, same}] with paragraph indexes, -1 where one side has none.
function alignParas(A, B) {
  const n = A.length, m = B.length, out = [];
  if (n * m > 400000) {
    for (let i = 0; i < Math.max(n, m); i++) out.push({a: i < n ? i : -1, b: i < m ? i : -1, same: i < n && i < m && A[i] === B[i]});
    return out;
  }
  const dp = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, ra = [], rb = [];
  const flush = () => {
    for (let t = 0; t < Math.max(ra.length, rb.length); t++) out.push({a: t < ra.length ? ra[t] : -1, b: t < rb.length ? rb[t] : -1, same: false});
    ra = []; rb = [];
  };
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { flush(); out.push({a: i, b: j, same: true}); i++; j++; }
    else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) ra.push(i++);
    else rb.push(j++);
  }
  flush();
  return out;
}
// Notes from draft A against draft B, matched by type and passage: dismissed in A, still open in B, fixed (gone),
// and new in B. Notes are {k, m} (m: 'applied' | 'dismissed' | null).
function compareNotes(A, B) {
  const inA = new Set(A.map(x => x.k)), inB = new Set(B.map(x => x.k)), out = {fixed: [], open: [], added: [], dismissed: []};
  for (const x of A) (x.m === 'dismissed' ? out.dismissed : inB.has(x.k) ? out.open : out.fixed).push(x);
  for (const x of B) if (!inA.has(x.k)) out.added.push(x);
  return out;
}
// What a re-check reads in full: the changed paragraphs, their neighbours, and paragraphs the last review tied
// to a changed one. prev and cur are paragraph fingerprints; links are [paragraph, paragraph] pairs (1-based) in
// the previous draft. Returns null when a full review makes more sense (nothing new, a short essay, or big changes).
function recheckPlan(prev, cur, links) {
  const had = new Set(prev), now = new Set(cur), changed = [], where = new Map();
  cur.forEach((h, i) => { if (!had.has(h)) changed.push(i + 1); if (!where.has(h)) where.set(h, i + 1); });
  if (!changed.length || cur.length < 6 || changed.length > Math.max(2, Math.floor(cur.length * 0.4))) return null;
  const full = new Set(changed);
  for (const n of changed) { if (n > 1) full.add(n - 1); if (n < cur.length) full.add(n + 1); }
  for (const [pa, pb] of Array.isArray(links) ? links : []) {
    const ha = prev[pa - 1], hb = prev[pb - 1];
    if (ha == null || hb == null) continue;
    if (!now.has(ha) && where.has(hb)) full.add(where.get(hb));
    if (!now.has(hb) && where.has(ha)) full.add(where.get(ha));
  }
  return {changed, full: [...full].sort((x, y) => x - y)};
}

// ---- research map: themes, links and open threads across the whole library ----
const RMAP_KINDS = ['clash', 'supports', 'builds_on', 'critiques', 'cites'];
// The model's map of the library, checked: documents must resolve, every document sits in at most one theme,
// link kinds come from a fixed list, and each link's passages must really be in its documents (a "cites" or
// "builds_on" link may name only its own side). o: {resolveDoc(ref) -> {id, title, text, claims} | null}
function validateRmap(raw, o) {
  const r = plainObj(raw), opt = plainObj(o), res = typeof opt.resolveDoc === 'function' ? opt.resolveDoc : () => null;
  const themes = [], placed = new Set();
  for (const t0 of (Array.isArray(r.themes) ? r.themes : []).slice(0, 12)) {
    const t = plainObj(t0), name = clip(t.name, 60), docs = [];
    for (const ref of (Array.isArray(t.docs) ? t.docs : []).slice(0, 60)) { const d = res(ref); if (d && !placed.has(d.id)) { placed.add(d.id); docs.push(d.id); } }
    if (name && docs.length) themes.push({name, docs});
    if (themes.length >= 6) break;
  }
  const links = [], seen = new Set();
  for (const l0 of (Array.isArray(r.links) ? r.links : []).slice(0, 60)) {
    const l = plainObj(l0), kind = clip(l.kind, 20).toLowerCase().replace(/[\s-]+/g, '_'), a = res(l.from), b = res(l.to);
    if (!RMAP_KINDS.includes(kind) || !a || !b || a.id === b.id) continue;
    const ra = locateInDoc(a, {claim: l.from_claim, quote: l.from_quote}), rb = locateInDoc(b, {claim: l.to_claim, quote: l.to_quote});
    if (!ra || (!rb && kind !== 'cites' && kind !== 'builds_on')) continue;
    const key = [a.id, b.id].sort().join('|') + '|' + kind;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({from: a.id, to: b.id, kind, qa: a.text.slice(ra[0], ra[1]).slice(0, 600), qb: rb ? b.text.slice(rb[0], rb[1]).slice(0, 600) : null,
      note: clip(l.note, 240), fix: kind === 'clash' ? clip(l.try, 240) : ''});
    if (links.length >= 24) break;
  }
  const threads = [];
  for (const t0 of (Array.isArray(r.threads) ? r.threads : []).slice(0, 12)) {
    const t = plainObj(t0), q = clip(t.question, 220), docs = [];
    for (const ref of (Array.isArray(t.docs) ? t.docs : []).slice(0, 12)) { const d = res(ref); if (d && !docs.includes(d.id)) docs.push(d.id); }
    if (q && docs.length) threads.push({q, docs, note: clip(t.note, 240)});
    if (threads.length >= 5) break;
  }
  return {themes, links, threads};
}

// ---- viva ("Defend it"): the examiner's questions, and verdicts on answers ----
const VERDICTS = ['strong', 'partial', 'weak'];
// Questions about the essay: no repeats, at most `max`; a quote is kept only when it is really in the essay.
function validateExam(raw, text, max) {
  const r = plainObj(raw), out = [], seen = new Set(), starts = paraStarts(text);
  for (const x of (Array.isArray(r.questions) ? r.questions : []).slice(0, 20)) {
    const o = plainObj(x), q = clip(o.question, 300), key = ideaKey(q);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const at = o.quote ? anchorFuzzy(text, o.quote) : null;
    out.push({q, why: clip(o.why, 140), quote: at ? text.slice(at[0], at[1]).slice(0, 600) : null, para: at ? paraIndex(starts, at[0]) : 0});
    if (out.length >= (max || 5)) break;
  }
  return out;
}
// A verdict on one answer, or null when the reply isn't one. A follow-up is never followed up again, nor is a strong answer.
function validateJudge(raw, isFollowUp) {
  const r = plainObj(raw), verdict = clip(r.verdict, 20).toLowerCase(), feedback = clip(r.feedback, 400);
  if (!VERDICTS.includes(verdict) || !feedback) return null;
  return {verdict, feedback, follow: isFollowUp || verdict === 'strong' ? '' : clip(r.follow_up, 240), fix: clip(r.fix, 240)};
}

// ---- your progress: habits found across essays, each backed by real notes ----
const HABIT_GROUPS = ['rel', 'logic', 'evid', 'clar', 'gram'];
// refs maps the note ids the prompt used ("N1"…) to {g}: a habit must cite at least two of them, and its group is
// one of the known ones (or, failing that, its notes' most common group). No repeats, at most `max`.
function validateHabits(raw, refs, max) {
  const r = plainObj(raw), out = [], seen = new Set();
  for (const x of (Array.isArray(r.habits) ? r.habits : []).slice(0, 20)) {
    const o = plainObj(x), title = clip(o.title, 80), key = ideaKey(title), notes = [];
    if (!key || seen.has(key)) continue;
    for (const n of (Array.isArray(o.notes) ? o.notes : []).slice(0, 12)) {
      const id = typeof n === 'number' ? 'N' + n : typeof n === 'string' ? n.trim().toUpperCase().replace(/^(\d+)$/, 'N$1') : '';
      if (/^N\d{1,4}$/.test(id) && hasOwn(refs, id) && !notes.includes(id)) notes.push(id);
      if (notes.length >= 4) break;
    }
    if (notes.length < 2) continue;
    let group = clip(o.group, 10);
    if (!HABIT_GROUPS.includes(group)) {
      const count = {}; for (const id of notes) { const g = plainObj(refs[id]).g; if (HABIT_GROUPS.includes(g)) count[g] = (count[g] || 0) + 1; }
      group = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
      if (!group) continue;
    }
    seen.add(key);
    out.push({title, group, detail: clip(o.detail, 300), tip: clip(o.tip, 240), notes});
    if (out.length >= (max || 5)) break;
  }
  return out;
}

// ---- a model's reply as JSON: the whole reply, a fenced block, or the outermost {...} in it ----
function parseJsonReply(text) {
  let s = String(text == null ? '' : text).trim();
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) s = fenced[1];
  try { return JSON.parse(s); } catch (e) {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {} }
  throw {code: 'invalid_json', message: 'The answer came back in the wrong shape.'};
}
