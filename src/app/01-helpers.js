// ---- small helpers ----
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // fixed icon markup only, never data
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'data') for (const d in v) el.dataset[d] = v[d];
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; el.append(c instanceof Node ? c : String(c)); }
  return el;
}
function fill(el, ...kids) {
  const a = document.activeElement, had = !!a && a !== document.body && el.contains(a), id = had && a.id;
  el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false));
  if (!had || (document.activeElement && document.activeElement !== document.body)) return;
  // Drawn again with the focus inside: it goes back to the same control, or to the heading of a full view.
  const t = (id && document.getElementById(id)) || (el.classList.contains('board') && el.querySelector('h2'));
  if (!t || !el.contains(t)) return;
  if (t.tagName === 'H2' && !t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
  t.focus({preventScroll: true});
}
function sv(tag, attrs) { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) el.setAttribute(k, attrs[k]); return el; }
const str = (v, max) => (v == null ? '' : String(v)).trim().slice(0, max || 1000);
const trunc = (s, n) => (s = String(s || '')).length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
const wait = ms => new Promise(r => setTimeout(r, ms));
const bytes = s => new TextEncoder().encode(s).length;
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
function ago(t) {
  if (!t) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  if (s < 86400 * 7) return plural(Math.floor(s / 86400), 'day') + ' ago';
  return new Date(t).toLocaleDateString(undefined, {day: 'numeric', month: 'short'});
}
let toastT = 0, toastUndo = null;
// undo, when given, puts an Undo button in the toast, which stays a little longer. It waits while the pointer or
// the keyboard is on it, and Ctrl+Z outside the essay runs it (`90`).
function toast(msg, undo) {
  toastUndo = undo ? () => { hideToast(); undo(); } : null;
  fill(toastEl, h('span', null, msg), undo ? h('button', {class: 'tundo', type: 'button', title: 'Undo (' + (mac ? '⌘Z' : 'Ctrl+Z') + ')', 'aria-keyshortcuts': mac ? 'Meta+Z' : 'Control+Z', onclick: () => toastUndo && toastUndo()}, 'Undo') : null);
  toastEl.classList.toggle('act', !!undo); toastEl.classList.add('show');
  toastLater(undo ? 7000 : 2800);
}
function toastLater(ms) { clearTimeout(toastT); toastT = setTimeout(hideToast, ms); }
function hideToast() {
  clearTimeout(toastT); toastUndo = null;
  if (toastEl.contains(document.activeElement)) document.activeElement.blur();
  toastEl.classList.remove('show');
}
const toastHeld = () => toastEl.matches(':hover') || toastEl.contains(document.activeElement);
toastEl.addEventListener('pointerenter', () => clearTimeout(toastT));
toastEl.addEventListener('focusin', () => clearTimeout(toastT));
toastEl.addEventListener('pointerleave', () => { if (toastEl.classList.contains('show') && !toastHeld()) toastLater(2500); });
toastEl.addEventListener('focusout', e => { if (toastEl.classList.contains('show') && !toastEl.contains(e.relatedTarget)) toastLater(2500); });
// What Tab can reach inside root, in order: shown, enabled, not taken out of the order.
function tabbables(root) {
  return [...root.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex]')]
    .filter(x => x.tabIndex >= 0 && !x.disabled && !x.closest('[hidden], [inert]') && x.getClientRects().length && (!x.checkVisibility || x.checkVisibility({visibilityProperty: true})));
}
// After a view is drawn again, focus that fell to the page goes to sel in box (or its first control), so the keyboard
// keeps its place.
function refocus(box, sel) {
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected) return;
  const t = (sel && box.querySelector(sel)) || tabbables(box)[0]; if (t) t.focus({preventScroll: true});
}
// A modal dialog keeps Tab inside it: past the last control comes the first, and the other way round.
function trapTab(box) {
  box.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = tabbables(box); if (!f.length) { e.preventDefault(); return; }
    const a = document.activeElement, i = f.indexOf(a);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  });
}

