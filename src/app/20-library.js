// ---- library: which sources and other essays count for each essay ----
// Other essays count by default (that's the library check); a source counts once you switch it on.
function isUsed(essay, d) {
  if (!essay || !d || d === essay || d.id === essay.id) return false;
  const u = essay.use;
  if (u && hasOwn(u, d.id)) return u[d.id] === true;
  return d.role !== 'source';
}
function setUsed(essay, d, on) {
  const e = ensureReal(essay);
  if (!e.use || Object.getPrototypeOf(e.use) !== null) e.use = cleanFlags(e.use);
  e.use[d.id] = !!on; e.updatedAt = Date.now();
  persist(e);
}
function contextDocs(essay) { return sortedDocs().filter(d => isUsed(essay, d) && d.text.trim().length >= 200); }
function setBrief(essay, text) {
  const e = ensureReal(essay), t = String(text == null ? '' : text).slice(0, LIMITS.briefChars);
  e.brief = t.trim() ? {text: t, at: Date.now()} : null; e.updatedAt = Date.now();
  persist(e);
}
