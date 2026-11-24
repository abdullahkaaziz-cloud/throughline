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
  return String(text == null ? '' : text).replace(/<(?=\s*\/?\s*(?:document|brief|essay|claims|plan|question)\b)/gi, '\u2039');
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
