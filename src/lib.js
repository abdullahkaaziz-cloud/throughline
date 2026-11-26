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
  return String(text == null ? '' : text).replace(/<(?=\s*\/?\s*(?:document|brief|essay|claims|plan|question|notes|answer|idea)\b)/gi, '\u2039');
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

// ---- consistent terms ----
// Two ways of writing a term share a key when they differ only in capitals, accents, hyphens, apostrophes or spaces:
// "e-mail", "E-mail", "email" and "e mail" all have the key "email".
const TERM_APOS = /[ʹ-ʿˈˊˋ]/gu;   // modifier letters used as apostrophes, for ʿayn and for hamza
const TERM_WORD = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:[-‐‑'’ʼ][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;
const termKeys = new Map();
function termKey(s) {
  s = String(s == null ? '' : s);
  let k = termKeys.get(s);
  if (k == null) {
    k = s.normalize('NFKD').replace(/\p{M}+/gu, '').replace(TERM_APOS, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (termKeys.size > 50000) termKeys.clear();
    termKeys.set(s, k);
  }
  return k;
}
// The same way of writing: curly and straight apostrophes, and the different hyphen characters, count as one.
const termForm = s => String(s == null ? '' : s).normalize('NFC').replace(/[‘’ʼ`´]/g, "'").replace(/[‐‑]/g, '-').replace(/\s+/g, ' ').trim();
// A term as the writer keeps it: plain text of one to four words.
function termText(v) {
  const t = clip(v, 200).replace(/\s+/g, ' ');
  if (t.length > 60) return '';
  const n = (t.match(TERM_WORD) || []).length;
  return n >= 1 && n <= 4 && termKey(t).length >= 2 ? t : '';
}
// Per character of the text: 1 inside a quotation (another writer's words are left alone), 2 on a heading line
// (short, with no closing punctuation, or in title case), where capitals are a matter of style.
function termFlags(text) {
  const f = new Uint8Array(text.length + 1), letter = c => /\p{L}/u.test(c || '');
  for (let p = 0; p <= text.length;) {
    let q = text.indexOf('\n', p); if (q < 0) q = text.length;
    const line = text.slice(p, q).trim(), ws = line.match(/\S+/g) || [];
    const long = ws.filter(w => /^\p{L}{4,}/u.test(w)), title = long.length > 1 && long.filter(w => /^\p{Lu}/u.test(w)).length / long.length >= 0.6;
    if (line && ws.length <= 12 && (!/[.!?:;…"”'’)\]]$/.test(line) || title)) f.fill(2, p, q);
    for (let i = p, open = -1, kind = ''; i < q; i++) {
      const c = text[i];
      if (open < 0) { if (c === '“' || c === '"' || (c === '‘' && !letter(text[i - 1]))) { open = i; kind = c; } }
      else if ((kind === '“' && c === '”') || (kind === '"' && c === '"') || (kind === '‘' && c === '’' && !(letter(text[i - 1]) && letter(text[i + 1])))) {
        for (let j = open; j <= i; j++) f[j] |= 1;
        open = -1;
      }
    }
    p = q + 1;
  }
  return f;
}
// Whether the word at s starts a sentence (or a paragraph), so its capital says nothing about how the term is written.
function termStart(text, s) {
  for (let i = s - 1; i >= 0; i--) {
    const c = text[i];
    if (c === '\n') return true;
    if (/[\s"“”'‘’«»(\[{*_–—-]/.test(c)) continue;
    return /[.!?:…]/.test(c);
  }
  return true;
}
// The words of a text, each with its key. A possessive ending ("’s") is kept apart (kb, eb) so "the e-mail’s" still
// counts as "e-mail"; soft: only spaces since the word before, so the two can be read as one term.
function termTokens(text) {
  text = String(text == null ? '' : text);
  const fl = termFlags(text), out = [];
  let prev = null;
  for (const m of text.matchAll(TERM_WORD)) {
    const s = m.index, t = m[0], e = s + t.length, pos = t.length > 2 && /['’ʼ][sS]$/.test(t);
    const tk = {s, e, t, k: termKey(t), kb: pos ? termKey(t.slice(0, -2)) : null, eb: pos ? e - 2 : e,
      soft: !!prev && /^[ \t ]+$/.test(text.slice(prev.e, s)), start: termStart(text, s), head: (fl[s] & 2) > 0, quoted: (fl[s] & 1) > 0};
    out.push(tk); prev = tk;
  }
  return out;
}
function termPrefixes(keys) {
  const pre = new Set();
  for (const k of keys.keys()) for (let i = 1; i <= k.length; i++) pre.add(k.slice(0, i));
  return pre;
}
// Every place one of these keys is written: runs of up to four words, the longest first, never overlapping, and never
// inside a quotation. A possessive ending stays outside the match.
function termFind(tokens, keys, pre) {
  pre = pre || termPrefixes(keys);
  const c = [];
  for (let i = 0; i < tokens.length; i++) {
    let acc = '';
    for (let n = 0; n < 4 && i + n < tokens.length; n++) {
      const tk = tokens[i + n];
      if (n && !tk.soft) break;
      if (tk.kb != null && keys.has(acc + tk.kb)) c.push({i, j: i + n, s: tokens[i].s, e: tk.eb, k: acc + tk.kb});
      acc += tk.k;
      if (keys.has(acc)) c.push({i, j: i + n, s: tokens[i].s, e: tk.e, k: acc});
      if (!pre.has(acc)) break;
    }
  }
  c.sort((a, b) => (b.e - b.s) - (a.e - a.s) || a.s - b.s);
  const end = tokens.length ? tokens[tokens.length - 1].e : 0, used = new Uint8Array(end + 1), out = [];
  for (const x of c) {
    let free = true; for (let p = x.s; p < x.e; p++) if (used[p]) { free = false; break; }
    if (!free) continue;
    used.fill(1, x.s, x.e);
    let q = false; for (let j = x.i; j <= x.j; j++) if (tokens[j].quoted) q = true;
    if (!q) out.push(x);
  }
  return out.sort((a, b) => a.s - b.s);
}
// Whether a written form is the form the writer keeps. A capital that only starts a sentence doesn't count, and
// in a heading neither do capitals.
function termSame(written, keep, start, head) {
  const a = termForm(written), b = termForm(keep);
  if (a === b) return true;
  if (head) return a.toLowerCase() === b.toLowerCase();
  return !!start && a.slice(1) === b.slice(1) && a[0].toLowerCase() === b[0].toLowerCase();
}
// The form to keep, capitalised to fit where it goes: at the start of a sentence, or in a heading in title case.
function termFit(keep, written, start, head) {
  const up = /^\p{Lu}/u.test(written);
  if (head && up) return keep.replace(/(^|[\s-])(\p{Ll})/gu, (m, a, c) => a + c.toUpperCase());
  if ((start || head) && up && /^\p{Ll}/u.test(keep)) return keep[0].toUpperCase() + keep.slice(1);
  return keep;
}
// The writer's terms by key, built once for many texts: which rule each key belongs to, and whether it's the kept form.
function termIndex(rules) {
  const by = new Map();
  rules.forEach((r, ri) => {
    const set = (f, keep) => { const k = termKey(f); if (k.length >= 2 && !by.has(k)) by.set(k, {ri, keep}); };
    set(r.keep, true); for (const f of r.forms || []) set(f, false);
  });
  return {by, pre: termPrefixes(by)};
}
// The places to change for the writer's terms ({keep, forms}): another way of writing the form they keep ("spell",
// which can be changed for them in one go) or another word for it ("word", which they rewrite themselves).
function termMatches(text, tokens, rules, ix) {
  const {by, pre} = ix || termIndex(rules);
  if (!by.size) return [];
  const out = [];
  for (const x of termFind(tokens, by, pre)) {
    const info = by.get(x.k), r = rules[info.ri], t = text.slice(x.s, x.e), a = tokens[x.i];
    if (info.keep && termSame(t, r.keep, a.start, a.head)) continue;
    out.push({s: x.s, e: x.e, t, ri: info.ri, how: info.keep ? 'spell' : 'word', start: a.start, head: a.head, fix: termFit(r.keep, t, a.start, a.head)});
  }
  return out;
}
// The different ways one term is written in these places ({s, e, t, start}), most used first. A capital that only
// starts a sentence goes with the way the term is written elsewhere.
function termWays(list) {
  const forms = new Map();
  const put = (id, t, o, fromStart) => { let f = forms.get(id); if (!f) forms.set(id, f = {t, n: 0, occ: [], fromStart}); f.n++; f.occ.push({s: o.s, e: o.e}); };
  const raw = o => String(o.t).replace(/\s+/g, ' ').trim();   // shown as the writer wrote it, curly apostrophes and all
  for (const o of list) if (!o.start) { const x = termForm(o.t); put(x, raw(o), o, false); }
  for (const o of list) if (o.start) {
    const x = termForm(o.t), hit = [...forms.keys()].find(id => id.slice(1) === x.slice(1) && id[0].toLowerCase() === x[0].toLowerCase());
    if (hit) put(hit, null, o); else put(x, raw(o), o, true);
  }
  // a way seen only at the start of sentences takes the capital most of the other places use
  const all = [...forms.values()], rest = all.filter(f => !f.fromStart);
  const low = rest.reduce((n, f) => n + (/^\p{Ll}/u.test(f.t) ? f.n : -f.n), 0);
  for (const f of all) if (f.fromStart && rest.length && low >= 0) f.t = f.t[0].toLowerCase() + f.t.slice(1);
  for (const f of all) f.occ.sort((a, b) => a.s - b.s);
  return all.sort((a, b) => b.n - a.n || a.occ[0].s - b.occ[0].s).map(f => ({t: f.t, n: f.n, occ: f.occ}));
}
// Pairs where both ways are right, for different jobs: "every day" and "everyday", "set up" and "setup".
const TERM_BOTH = new Set(('everyday anyone anymore anyway anybody anything anywhere everyone everybody everything everywhere sometime sometimes ' +
  'someday somebody someone something somewhere maybe already altogether alright awhile apart into onto upon nobody cannot forever overall ' +
  'whatever however whoever wherever whenever backup setup login logout workout checkout breakdown takeover makeup turnover layout lookup ' +
  'cutoff followup buildup tradeoff signup checkin handout printout payoff startup standby walkthrough rollout spinoff shutdown dropout pickup ' +
  'grownup longterm shortterm fulltime parttime firsthand inperson daytoday facetoface uptodate decisionmaking wellknown highquality').split(' '));
// Terms written more than one way, found on the device: the same words with other hyphens, spaces, capitals, accents
// or apostrophes ("e-mail", "email", "e mail"). The same plain word capitalised two ways ("Church", "church") is often
// deliberate, so it's left out; so are headings and quotations.
function termGroups(text, tokens, max) {
  const occ = new Map(), add = (k, o) => { let a = occ.get(k); if (!a) occ.set(k, a = []); a.push(o); };
  const ok = tk => !tk.quoted && !tk.head;
  for (const tk of tokens) {
    if (!ok(tk)) continue;
    const k = tk.kb != null ? tk.kb : tk.k;
    if (k.length >= 4 && !/^\p{N}+$/u.test(k) && !TERM_BOTH.has(k)) add(k, {s: tk.s, e: tk.eb, t: text.slice(tk.s, tk.eb), start: tk.start, open: false});
  }
  for (let i = 0; i < tokens.length; i++) {
    if (!ok(tokens[i])) continue;
    let acc = tokens[i].k;
    for (let n = 1; n < 3 && i + n < tokens.length; n++) {
      const tk = tokens[i + n]; if (!tk.soft || !ok(tk)) break;
      const kb = tk.kb != null ? acc + tk.kb : null; acc += tk.k;
      const k = occ.has(acc) ? acc : kb && occ.has(kb) ? kb : null;
      if (k) { const e = k === acc ? tk.e : tk.eb; add(k, {s: tokens[i].s, e, t: text.slice(tokens[i].s, e), start: tokens[i].start, open: true}); }
    }
  }
  const out = [];
  for (const [k, list] of occ) {
    if (list.length < 2) continue;
    const ways = termWays(list);
    if (ways.length < 2) continue;
    const open = list.some(o => o.open), ts = ways.map(w => w.t);
    if (!open && !ts.some(t => /[-'ʾʿ]/.test(t)) && new Set(ts.map(t => t[0].toLowerCase() + t.slice(1))).size === 1) continue;
    out.push({key: k, open, n: list.length, ways});
  }
  return out.sort((a, b) => b.n - a.n || a.ways[0].occ[0].s - b.ways[0].occ[0].s).slice(0, max || 12);
}
// The model's groups of forms that mean the same thing. A form stays only where the essay really uses it (outside
// headings and quotations), each term goes in one group at most, and a group needs two different terms, or one term
// written in two ways. Each group comes back with the ways it is written and how often.
function validateTerms(raw, text, tokens, max) {
  text = String(text == null ? '' : text); tokens = tokens || termTokens(text);
  const cand = [];
  for (const g of (Array.isArray(plainObj(raw).groups) ? plainObj(raw).groups : []).slice(0, 20)) {
    const o = plainObj(g), forms = [];
    for (const f of (Array.isArray(o.forms) ? o.forms : []).slice(0, 8)) { const t = termText(f), k = termKey(t); if (t && !forms.some(x => x.k === k)) forms.push({t, k}); }
    cand.push({label: clip(o.label, 50), keep: termKey(termText(o.keep)), forms});
  }
  const keys = new Map(cand.flatMap(c => c.forms.map(f => [f.k, 1])));
  if (!keys.size) return [];
  const found = new Map();
  for (const x of termFind(tokens, keys)) {
    if (tokens[x.i].head) continue;
    let a = found.get(x.k); if (!a) found.set(x.k, a = []);
    a.push({s: x.s, e: x.e, t: text.slice(x.s, x.e), start: tokens[x.i].start});
  }
  const out = [], used = new Set();
  for (const c of cand) {
    const forms = c.forms.filter(f => found.has(f.k) && !used.has(f.k));
    if (!forms.length) continue;
    const ways = termWays(forms.flatMap(f => found.get(f.k))).map(w => Object.assign(w, {k: termKey(w.t)}));
    if (forms.length < 2 && ways.length < 2) continue;
    forms.forEach(f => used.add(f.k));
    const keep = forms.find(f => f.k === c.keep) || forms[0];
    out.push({label: c.label, keep: keep.t, forms: [keep.t, ...forms.filter(f => f !== keep).map(f => f.t)], ways});
    if (out.length >= (max || 8)) break;
  }
  return out;
}
// The writer's terms as stored: the form to keep and other words for it, each term in one place only; and the groups
// they said are different (sorted keys joined by "|").
function cleanTermRules(x) {
  const r = plainObj(x);
  if (r.kind !== 'terms') return null;
  const rules = [], seen = new Set(), ids = new Set();
  for (const y of (Array.isArray(r.rules) ? r.rules : []).slice(0, 150)) {
    const o = plainObj(y), keep = termText(o.keep), k = termKey(keep);
    if (!keep || seen.has(k)) continue;
    seen.add(k);
    const forms = [];
    for (const f of (Array.isArray(o.forms) ? o.forms : []).slice(0, 12)) { const t = termText(f), fk = termKey(t); if (t && !seen.has(fk)) { seen.add(fk); forms.push(t); } }
    let id = safeId(o.id) && !ids.has(o.id) ? o.id : '';
    for (let n = rules.length; !id; n++) if (!ids.has('r' + n)) id = 'r' + n;
    ids.add(id);
    rules.push({id, keep, forms, label: clip(o.label, 50)});
    if (rules.length >= 100) break;
  }
  const apart = [...new Set((Array.isArray(r.apart) ? r.apart : []).filter(s => typeof s === 'string' && s.length <= 300 && /^[\p{L}\p{N}]+(?:\|[\p{L}\p{N}]+)*$/u.test(s)))].slice(-300);
  return {rules, apart};
}
// The AI's groups kept with an essay: shapes only. They are checked against the text each time they're shown.
function cleanTermCache(x) {
  const r = plainObj(x);
  if (typeof r.sig !== 'string' || !r.sig || r.sig.length > 40) return null;
  const groups = [];
  for (const g of (Array.isArray(r.groups) ? r.groups : []).slice(0, 12)) {
    const o = plainObj(g), forms = (Array.isArray(o.forms) ? o.forms : []).slice(0, 8).map(termText).filter(Boolean);
    if (forms.length) groups.push({label: clip(o.label, 50), keep: termText(o.keep) || forms[0], forms});
  }
  return {sig: r.sig, at: Number.isFinite(r.at) ? r.at : 0, groups};
}

// ---- Grow: thinking an idea through, one question at a time ----
// The kinds of question, in the order they are tried when two are equally thin. "reply" answers an objection.
const GROW_KINDS = ['why', 'mean', 'against', 'follow', 'link', 'reply'];
const growKids = (G, id) => G.nodes.filter(n => n.p === id);
function growCounts(G) {
  const c = {why: 0, mean: 0, against: 0, follow: 0, link: 0, reply: 0};
  for (const n of G.nodes) c[n.k]++;
  return c;
}
// The writer's idea as stored: their starting thought and one-line point, their answers as a tree (each answer under
// the one it was asked about, '' being the starting thought), questions they parked, the question on screen, and the
// order of their reasons.
function cleanGrow(x) {
  const r = plainObj(x), nodes = [], ids = new Set(['']), at = v => Number.isFinite(v) ? v : 0;
  for (const y of (Array.isArray(r.nodes) ? r.nodes : []).slice(0, 300)) {
    const o = plainObj(y), p = typeof o.p === 'string' ? o.p : '', a = clip(o.a, 1200).trim();
    if (!safeId(o.id) || ids.has(o.id) || !GROW_KINDS.includes(o.k) || !ids.has(p) || !a) continue;
    nodes.push({id: o.id, p, k: o.k, q: clip(o.q, 240), a, at: at(o.at)});
    ids.add(o.id);
  }
  const park = [];
  for (const y of (Array.isArray(r.park) ? r.park : []).slice(0, 40)) {
    const o = plainObj(y), p = typeof o.p === 'string' ? o.p : '', q = clip(o.q, 240).trim();
    if (safeId(o.id) && GROW_KINDS.includes(o.k) && ids.has(p) && q && !park.some(z => z.id === o.id)) park.push({id: o.id, p, k: o.k, q, at: at(o.at)});
  }
  const a = plainObj(r.ask), ap = typeof a.p === 'string' ? a.p : '';
  const ask = GROW_KINDS.includes(a.k) && ids.has(ap) && clip(a.q, 240).trim() ? {p: ap, k: a.k, q: clip(a.q, 240).trim(), why: clip(a.why, 200), src: a.src === 'ai' ? 'ai' : 'tpl'} : null;
  const order = [...new Set((Array.isArray(r.order) ? r.order : []).filter(id => typeof id === 'string' && ids.has(id) && id))];
  return {root: clip(r.root, 600), line: clip(r.line, 600), nodes, park, ask, order, at: at(r.at)};
}
// The reasons for the starting thought (its "why" and "what follows" answers), in the writer's order.
function growReasons(G) {
  const rs = growKids(G, '').filter(n => n.k === 'why' || n.k === 'follow');
  const pos = id => { const i = G.order.indexOf(id); return i < 0 ? 1e6 + rs.findIndex(n => n.id === id) : i; };
  return rs.sort((a, b) => pos(a.id) - pos(b.id));
}
// What to ask next, as {p: the answer it is about ('' for the starting thought), k: the kind of question}.
// An objection waiting for a reply comes first. Otherwise the move made least so far: another reason, what you mean,
// who disagrees, what follows, what backs a reason up, how answers connect. With `focus` (an answer's id, or '' for
// the starting thought), the writer chose what to be asked about. Questions they parked aren't asked again, and after
// a skip (`avoid`, the kind skipped) another kind comes first.
function growNext(G, focus, avoid) {
  const kids = id => growKids(G, id), parked = (p, k) => G.park.some(q => q.p === p && q.k === k), ok = (p, k) => !parked(p, k);
  const has = (id, k) => kids(id).some(n => n.k === k), latest = G.nodes.slice().sort((a, b) => b.at - a.at);
  const c = growCounts(G), reasons = kids('').filter(n => n.k === 'why');
  if (focus != null) {
    const f = focus === '' ? {id: '', k: 'root'} : G.nodes.find(n => n.id === focus);
    if (!f) return growNext(G, null);
    if (f.k === 'against') return ok(f.id, 'reply') && !has(f.id, 'reply') ? {p: f.id, k: 'reply'} : {p: f.id, k: 'why'};
    const order = ['why', 'against', 'mean', 'follow', 'link'].filter(k => (k !== 'link' || G.nodes.length >= 2) && ok(f.id, k));
    const n = k => kids(f.id).filter(x => x.k === k).length;
    const k = order.reduce((b, k) => (n(k) < n(b) || (n(k) === n(b) && c[k] < c[b]) ? k : b), order[0] || 'why');
    return {p: f.id, k};
  }
  const wait = G.nodes.find(n => n.k === 'against' && !has(n.id, 'reply') && ok(n.id, 'reply'));
  if (wait) return {p: wait.id, k: 'reply'};
  // among answers not yet asked this, the least developed one (fewest answers under it), the newest first
  const fresh = (list, k) => list.filter(x => !has(x.id, k) && x.k !== 'against' && x.k !== 'reply' && ok(x.id, k))
    .sort((a, b) => kids(a.id).length - kids(b.id).length || b.at - a.at)[0];
  const moves = {
    reason: {n: reasons.length, k: 'why', at: () => ok('', 'why') ? '' : null},
    mean: {n: c.mean, k: 'mean', at: () => !has('', 'mean') && ok('', 'mean') ? '' : (fresh(reasons, 'mean') || fresh(latest, 'mean') || {}).id},
    against: {n: c.against, k: 'against', at: () => !has('', 'against') && ok('', 'against') ? '' : (fresh(reasons, 'against') || {}).id},
    follow: {n: c.follow, k: 'follow', at: () => !has('', 'follow') && ok('', 'follow') ? '' : (fresh(reasons, 'follow') || fresh(latest, 'follow') || {}).id},
    support: {n: c.why - reasons.length, k: 'why', at: () => (fresh(reasons, 'why') || {}).id},
    link: {n: c.link, k: 'link', at: () => (latest.find(x => ok(x.id, 'link')) || {}).id},
  };
  const order = Object.keys(moves).filter(m => m === 'reason' || (m === 'link' ? G.nodes.length >= 3 : reasons.length >= 1));
  if (!reasons.length) order.splice(1);
  order.sort((a, b) => (moves[a].k === avoid) - (moves[b].k === avoid) || moves[a].n - moves[b].n || Object.keys(moves).indexOf(a) - Object.keys(moves).indexOf(b));
  for (const m of order) { const p = moves[m].at(); if (p != null) return {p, k: moves[m].k}; }
  return null;
}
// One question from the model: a single line ending with a question mark, and a short reason it matters.
function validateGrowQ(raw) {
  const r = plainObj(raw), q = clip(r.question, 400).replace(/\s+/g, ' ').trim(), why = clip(r.why, 400).replace(/\s+/g, ' ').trim();
  if (!q || q.length > 240 || !q.includes('?')) return null;
  return {question: q, why: why.length <= 200 ? why : ''};
}

// ---- the loom: an essay's ideas as threads through its paragraphs ----
const LOOM_HOW = ['woven', 'under', 'knot'];
// The model's threads checked against the paragraphs (`paras`, as textParas gives them). Every quote must be in the
// essay, and moves its place to the paragraph it's really in; a thread keeps one place per paragraph (a knot over
// woven over under); references to other threads must exist. The thesis comes first, then at most `max` other
// threads. Numbers stay as the model gives them (paragraphs and threads from 1), so the result can be checked again
// later against the essay as it is then.
function validateLoom(raw, paras, max) {
  const r = plainObj(raw), N = paras.length, norms = paras.map(p => normMap(p)), rank = {knot: 3, woven: 2, under: 1};
  const found = (i, q) => i >= 0 && i < N && !!anchorFuzzy(paras[i], q, null, norms[i]);
  const where = (q, hint) => {
    if (found(hint, q)) return hint;
    let best = -1;
    for (let i = 0; i < N; i++) if (found(i, q) && (best < 0 || Math.abs(i - hint) < Math.abs(best - hint))) best = i;
    return best;
  };
  const kept = [];
  (Array.isArray(r.threads) ? r.threads : []).slice(0, 12).forEach((t0, ti) => {
    const o = plainObj(t0), name = clip(o.name, 60).replace(/\s+/g, ' ').trim();
    if (!name || name.length > 40) return;
    const at = new Map();
    for (const x of (Array.isArray(o.paras) ? o.paras : []).slice(0, 80)) {
      const e = plainObj(x), how = LOOM_HOW.includes(e.how) ? e.how : null, hint = Number.isInteger(e.p) ? e.p - 1 : -1, quote = clip(e.quote, 240).trim();
      if (!how) continue;
      let p = hint;
      if (quote) { p = where(quote, hint); if (p < 0) continue; }
      else if (how !== 'under' || hint < 0 || hint >= N) continue;
      const cur = at.get(p);
      if (cur && rank[cur.how] >= rank[how]) continue;
      at.set(p, {p: p + 1, how, quote, with: how === 'knot' && Number.isInteger(e.with) && e.with > 0 ? e.with : 0, note: how === 'knot' ? clip(e.note, 200) : ''});
    }
    if (!at.size) return;
    const ask = clip(o.ask, 400).replace(/\s+/g, ' ').trim();
    kept.push({from: ti + 1, t: {name, thesis: o.thesis === true, paras: [...at.values()].sort((a, b) => a.p - b.p), dropped: o.dropped === true,
      note: clip(o.note, 300), ask: ask.includes('?') && ask.length <= 240 ? ask : ''}});
  });
  const thesis = kept.find(k => k.t.thesis), rest = kept.filter(k => k !== thesis).slice(0, max || 5);
  for (const k of rest) k.t.thesis = false;
  const order = (thesis ? [thesis] : []).concat(rest), num = new Map(order.map((k, i) => [k.from, i + 1]));
  const threads = order.map((k, i) => Object.assign(k.t, {paras: k.t.paras.map(e => Object.assign(e, {with: e.with && num.get(e.with) !== i + 1 ? num.get(e.with) || 0 : 0}))}));
  const links = [], seen = new Set();
  for (const x of (Array.isArray(r.links) ? r.links : []).slice(0, 40)) {
    const e = plainObj(x), a = num.get(e.a), b = num.get(e.b), key = [a, b].sort().join('-');
    if (!a || !b || a === b || !['supports', 'tension'].includes(e.how) || seen.has(key)) continue;
    seen.add(key); links.push({a, b, how: e.how, note: clip(e.note, 200)});
  }
  return {threads, links};
}
// What the loom shows for each thread, given the paragraph count and the threads the writer meant to drop: where it
// first and last appears (0-based), its knots, whether it's a loose end (the model says it's left unresolved and it
// doesn't reach the last paragraph), and whether it's new in the conclusion (first seen in the last paragraph).
function loomFacts(L, N, keep) {
  return L.threads.map(t => {
    const on = t.paras.filter(x => x.how !== 'under').map(x => x.p - 1);
    const first = on.length ? Math.min(...on) : -1, last = on.length ? Math.max(...on) : -1;
    return {first, last, knots: t.paras.filter(x => x.how === 'knot').length,
      loose: !t.thesis && t.dropped && last >= 0 && last < N - 1 && !(keep || []).includes(t.name),
      fresh: !t.thesis && N >= 3 && first === N - 1};
  });
}
// The loom kept with an essay: the text's hash when it was woven, and the names of threads the writer meant to drop.
function cleanLoom(x, paras) {
  const r = plainObj(x);
  if (typeof r.sig !== 'string' || !r.sig || r.sig.length > 40) return null;
  const v = validateLoom(r, paras || [], 5);
  return {sig: r.sig, at: Number.isFinite(r.at) ? r.at : 0, threads: v.threads, links: v.links,
    keep: [...new Set((Array.isArray(r.keep) ? r.keep : []).filter(s => typeof s === 'string' && s.length <= 40))].slice(0, 20)};
}

// ---- Build-up: how an essay leads a reader to its point ----
const BUILD_MOVES = ['hook', 'stakes', 'claim', 'reason', 'other', 'reply', 'close'];
// The shapes an essay can take: the steps a reader needs, in order, and the rise and fall of a strong build-up
// (how much a reader wants to read on, 0–100, at points through the essay).
const BUILD_SHAPES = {
  problem: {label: 'Problem → answer', steps: [['hook', 'Hook'], ['stakes', 'Stakes'], ['claim', 'Your claim'], ['reason', 'Reasons and evidence'], ['other', 'The other side'], ['reply', 'Your reply'], ['close', 'Conclusion']],
    ideal: [[0, 35], [0.25, 55], [0.5, 70], [0.75, 85], [1, 65]]},
  myth: {label: 'Myth → reality', steps: [['hook', 'Hook'], ['other', 'The common view'], ['reply', 'What’s wrong with it'], ['claim', 'What’s really true'], ['reason', 'Why it’s true'], ['stakes', 'Why it matters'], ['close', 'Conclusion']],
    ideal: [[0, 60], [0.25, 50], [0.5, 70], [0.75, 80], [1, 65]]},
  sides: {label: 'Two sides → verdict', steps: [['hook', 'Hook'], ['stakes', 'The question'], ['other', 'One side'], ['reason', 'The other side'], ['reply', 'Weighing them'], ['claim', 'Your verdict'], ['close', 'Conclusion']],
    ideal: [[0, 40], [0.3, 60], [0.6, 65], [0.85, 80], [1, 70]]},
};
// The model's reading checked against the paragraphs: known moves only, quotes that are really in their paragraph,
// one entry per paragraph, pulls from 0 to 100, and a reordering only if it uses every paragraph once. Numbers stay
// as the model gives them (from 1), so the result can be checked again later.
function validateBuild(raw, paras, max) {
  const r = plainObj(raw), N = paras.length, num = v => Number.isInteger(v) && v >= 1 && v <= N ? v : 0, line = (v, n) => clip(v, n * 2).replace(/\s+/g, ' ').trim().slice(0, n);
  const by = new Map();
  for (const x of (Array.isArray(r.paras) ? r.paras : []).slice(0, 200)) {
    const e = plainObj(x), p = num(e.p);
    if (!p || by.has(p)) continue;
    const moves = [...new Set((Array.isArray(e.moves) ? e.moves : []).filter(m => BUILD_MOVES.includes(m)))].slice(0, 4);
    const quote = clip(e.quote, 240).trim(), pull = typeof e.pull === 'number' && isFinite(e.pull) ? Math.round(Math.min(100, Math.max(0, e.pull))) : null;
    by.set(p, {p, moves, quote: quote && anchorFuzzy(paras[p - 1], quote) ? quote : '', pull, why: line(e.why, 120)});
  }
  const list = [];
  for (let p = 1; p <= N; p++) list.push(by.get(p) || {p, moves: [], quote: '', pull: null, why: ''});
  const open = [];
  for (const x of (Array.isArray(r.open) ? r.open : []).slice(0, 8)) {
    const e = plainObj(x), q = line(e.q, 140), raised = num(e.raised), answered = num(e.answered);
    if (q && q.includes('?') && raised && open.length < 4) open.push({q, raised, answered: answered >= raised ? answered : 0});
  }
  const fixes = [];
  for (const x of (Array.isArray(r.fixes) ? r.fixes : []).slice(0, 10)) {
    const e = plainObj(x), kind = ['missing', 'order', 'weak'].includes(e.kind) ? e.kind : null, title = line(e.title, 90), ask = line(e.ask, 220);
    if (!kind || !title || !BUILD_MOVES.includes(e.move) || !num(e.p) || fixes.length >= (max || 3)) continue;
    const ord = Array.isArray(e.order) ? e.order : [], perm = kind === 'order' && ord.length === N && new Set(ord).size === N && ord.every(v => num(v));
    fixes.push({kind, move: e.move, p: e.p, title, why: line(e.why, 320), ask: ask.includes('?') ? ask : '', order: perm && ord.some((v, i) => v !== i + 1) ? ord.slice() : null});
  }
  return {shape: hasOwn(BUILD_SHAPES, r.shape) ? r.shape : 'problem', paras: list, open, fixes};
}
// The steps of one shape in this essay: the paragraphs that take each one, and whether it's there ("ok"), missing,
// weak (a fix says it doesn't do its job), or early (it comes before a step that should lead up to it).
function buildSteps(B, shape) {
  const S = BUILD_SHAPES[hasOwn(BUILD_SHAPES, shape) ? shape : 'problem'];
  const steps = S.steps.map(([move, label]) => ({move, label, paras: B.paras.filter(e => e.moves.includes(move)).map(e => e.p), status: 'ok'}));
  let seen = 0;
  for (const s of steps) {
    if (!s.paras.length) { s.status = 'missing'; continue; }
    if (B.fixes.some(f => f.kind === 'weak' && f.move === s.move)) s.status = 'weak';
    else if (s.paras[0] < seen) s.status = 'early';
    seen = Math.max(seen, s.paras[0]);
  }
  return steps;
}
// A strong build-up for this shape, at each of n paragraphs: 0–100.
function buildIdeal(shape, n) {
  const pts = BUILD_SHAPES[hasOwn(BUILD_SHAPES, shape) ? shape : 'problem'].ideal;
  return Array.from({length: n}, (_, i) => {
    const t = n > 1 ? i / (n - 1) : 0.5, j = Math.max(1, pts.findIndex(p => p[0] >= t));
    const [a, b] = [pts[j - 1], pts[j]], f = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
    return Math.round(a[1] + (b[1] - a[1]) * f);
  });
}
// Build-up kept with an essay: the text's hash when it was read, and the shape the writer chose to look at.
function cleanBuild(x, paras) {
  const r = plainObj(x);
  if (typeof r.sig !== 'string' || !r.sig || r.sig.length > 40) return null;
  return Object.assign(validateBuild(r, paras || [], 3), {sig: r.sig, at: Number.isFinite(r.at) ? r.at : 0, pick: hasOwn(BUILD_SHAPES, r.pick) ? r.pick : null});
}

// ---- usage: what each tester uses, counted per day, never any text ----
// One record per tester: {kind:'usage', v:1, name, own, since, at, days:{'YYYY-MM-DD': day}, old: day, errs}.
// A day: f, per feature: n calls, ok, i characters sent, o characters back, ms (finished calls), s (calls on the
// sample essay), t calls per tier, x failures by kind; q, per kind of note: s shown, u useful, d not useful, f fixed,
// x dismissed, w why not useful; e: js page errors, save failed saves. Days older than USAGE_KEEP roll into old.
const USAGE_FEATURES = ['review', 'recheck', 'ask', 'index', 'argument', 'ideas', 'map', 'viva', 'judge', 'habits', 'terms', 'grow', 'loom', 'build'];
const USAGE_FAILS = ['limit', 'busy', 'timeout', 'unusable', 'denied', 'error', 'cancelled'];
const USAGE_TIERS = ['quick', 'default', 'complex'];
const NOTE_FIELDS = ['s', 'u', 'd', 'f', 'x'];
const NOTE_WHY = ['wrong', 'minor', 'unclear', 'repeat'];
const FEAT_FIELDS = ['n', 'ok', 'i', 'o', 'ms', 's'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const USAGE_KEEP = 120;
const ucount = v => Number.isFinite(v) ? Math.max(-1e6, Math.min(1e12, Math.round(v))) : 0;
const uts = v => Number.isFinite(v) && v > 0 ? Math.min(v, 4e12) : 0;
function ucounts(x, keys) {
  const o = plainObj(x), out = {};
  for (const k of keys) if (hasOwn(o, k)) { const v = ucount(o[k]); if (v) out[k] = v; }
  return out;
}
function cleanUsageDay(x, noteTypes) {
  const o = plainObj(x), F = plainObj(o.f), Q = plainObj(o.q), f = {}, q = {};
  for (const k of USAGE_FEATURES) if (hasOwn(F, k)) {
    const v = ucounts(F[k], FEAT_FIELDS), t = ucounts(plainObj(F[k]).t, USAGE_TIERS), x2 = ucounts(plainObj(F[k]).x, USAGE_FAILS);
    if (Object.keys(t).length) v.t = t;
    if (Object.keys(x2).length) v.x = x2;
    if (Object.keys(v).length) f[k] = v;
  }
  for (const k of noteTypes || []) if (typeof k === 'string' && hasOwn(Q, k)) {
    const v = ucounts(Q[k], NOTE_FIELDS), w = ucounts(plainObj(Q[k]).w, NOTE_WHY);
    if (Object.keys(w).length) v.w = w;
    if (Object.keys(v).length) q[k] = v;
  }
  return {f, q, e: ucounts(o.e, ['js', 'save'])};
}
function cleanUsage(x, noteTypes) {
  const r = plainObj(x);
  if (r.kind !== 'usage') return null;
  const D = plainObj(r.days), days = {};
  for (const k of Object.keys(D).filter(k => DAY_RE.test(k)).sort().slice(-USAGE_KEEP - 7)) days[k] = cleanUsageDay(D[k], noteTypes);
  const errs = (Array.isArray(r.errs) ? r.errs : []).slice(-10).map(e0 => {
    const e = plainObj(e0);
    return {at: uts(e.at), n: typeof e.n === 'string' && /^[A-Za-z][A-Za-z0-9:_ -]{0,39}$/.test(e.n) ? e.n : 'Error',
      l: Number.isInteger(e.l) && e.l >= 0 && e.l < 1e7 ? e.l : 0, c: Number.isInteger(e.c) && e.c >= 0 && e.c < 1e7 ? e.c : 0};
  });
  return {name: clip(r.name, 80), own: r.own === true, since: uts(r.since), at: uts(r.at), days, old: cleanUsageDay(r.old, noteTypes), errs};
}
const emptyDay = () => ({f: {}, q: {}, e: {}});
function addCounts(a, b, keys) { for (const k of keys) if (hasOwn(b, k)) a[k] = ucount((hasOwn(a, k) ? a[k] : 0) + b[k]); return a; }
// a += b, for two clean days.
function usageAddDay(a, b) {
  for (const k of USAGE_FEATURES) if (hasOwn(b.f, k)) {
    const t = hasOwn(a.f, k) ? a.f[k] : (a.f[k] = {}), v = b.f[k];
    addCounts(t, v, FEAT_FIELDS);
    if (v.t) addCounts(t.t || (t.t = {}), v.t, USAGE_TIERS);
    if (v.x) addCounts(t.x || (t.x = {}), v.x, USAGE_FAILS);
  }
  for (const k of Object.keys(b.q)) {
    const t = hasOwn(a.q, k) ? a.q[k] : (a.q[k] = {}), v = b.q[k];
    addCounts(t, v, NOTE_FIELDS);
    if (v.w) addCounts(t.w || (t.w = {}), v.w, NOTE_WHY);
  }
  addCounts(a.e, b.e, ['js', 'save']);
  return a;
}
// Adds what this browser counted since the last write (delta: {days, errs}) to the stored record, and rolls days
// older than USAGE_KEEP into old, so the record stays small however long someone uses Throughline.
function usageMerge(rec, delta, today, info) {
  const u = rec || {name: '', own: false, since: 0, at: 0, days: {}, old: emptyDay(), errs: []};
  for (const k of Object.keys(delta.days || {})) if (DAY_RE.test(k)) usageAddDay(hasOwn(u.days, k) ? u.days[k] : (u.days[k] = emptyDay()), delta.days[k]);
  const cut = new Date(today + 'T00:00:00Z'); cut.setUTCDate(cut.getUTCDate() - USAGE_KEEP);
  const cutKey = cut.toISOString().slice(0, 10);
  for (const k of Object.keys(u.days)) if (k < cutKey) { usageAddDay(u.old, u.days[k]); delete u.days[k]; }
  u.errs = u.errs.concat(delta.errs || []).slice(-10);
  if (info) { u.name = clip(info.name, 80); u.own = info.own === true; u.at = uts(info.at); if (!u.since) u.since = uts(info.at); }
  return u;
}
// Calendar weeks start on Monday (UTC); a week is named by its Monday.
function weekOf(day) { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
function lastWeeks(today, n) {
  const w = new Date(weekOf(today) + 'T00:00:00Z'), out = [];
  for (let i = n - 1; i >= 0; i--) { const x = new Date(w); x.setUTCDate(w.getUTCDate() - 7 * i); out.push(x.toISOString().slice(0, 10)); }
  return out;
}
const dayCalls = (day, real) => USAGE_FEATURES.reduce((s, k) => s + (hasOwn(day.f, k) ? (day.f[k].n || 0) - (real ? day.f[k].s || 0 : 0) : 0), 0);
// The weeks someone ran at least one AI action (real: on an essay of their own, not the sample).
function activeWeeks(u, real) { const s = new Set(); for (const k of Object.keys(u.days)) if (dayCalls(u.days[k], real) > 0) s.add(weekOf(k)); return s; }
// Everything counted from one day to another (inclusive), as one day.
function usageSum(u, from, to) { const out = emptyDay(); for (const k of Object.keys(u.days)) if (k >= from && k <= to) usageAddDay(out, u.days[k]); return out; }
// Estimated cost in US dollars of one feature's counts, from characters (cpt characters to a token) and prices per
// million tokens; a model with a long-prompt price uses it when the average prompt is over its limit.
function usageCost(v, price, cpt) {
  if (!v || !price) return 0;
  const tin = (v.i || 0) / cpt, tout = (v.o || 0) / cpt, p = price.long && v.n && tin / v.n > price.long.over ? price.long : price;
  return (tin * p.in + tout * p.out) / 1e6;
}
// Nearest-rank percentile of numbers.
function pctile(list, p) { const s = list.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil(p / 100 * s.length) - 1))] : 0; }
