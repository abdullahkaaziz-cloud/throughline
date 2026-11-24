// ---- text helpers (shared by the page and the Node tests) ----
const QMAP = {'‘':"'",'’':"'",'‚':"'",'‛':"'",'′':"'",'“':'"','”':'"','„':'"','″':'"','–':'-','—':'-','−':'-'};
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
