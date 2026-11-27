// Keyboard checks for the browser tests, injected before the page's own script. window.__kb measures what a
// keyboard user meets: which controls Tab can reach, whether each shows a focus indicator with 3:1 contrast, and
// whether anything covers it. It also notes which elements were given click handlers, to find any a keyboard can't use.
(() => {
  const add = EventTarget.prototype.addEventListener, CLICKS = new Set(['click', 'pointerdown', 'mousedown', 'dblclick']);
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    try { if (CLICKS.has(type) && this instanceof Element) (this.__kbClick || (this.__kbClick = new Set())).add(type); } catch (e) {}
    return add.call(this, type, fn, opts);
  };
  const CONTROLS = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex], [role=button], [role=tab], [role=link], [role=checkbox], [role=switch], [role=menuitem], [role=option], [role=radio], [role=slider], [contenteditable="true"]';
  let cx = null;
  function rgba(c) {   // any CSS colour, as the browser resolves it
    if (!cx) cx = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255];
  }
  const over = (top, bot) => [0, 1, 2].map(i => top[i] * top[3] + bot[i] * (1 - top[3])).concat([1]);
  function canvasBg() { const e = document.createElement('div'); e.style.background = 'Canvas'; document.body.append(e); const c = getComputedStyle(e).backgroundColor; e.remove(); return rgba(c); }
  function bgOf(el) {   // the colour behind el, with see-through layers composited
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; } }
    let base = layers.length && layers[layers.length - 1][3] >= 0.999 ? layers.pop() : canvasBg();
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  }
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function shown(el) {
    if (el.closest('[hidden], [inert]')) return false;
    if (el.checkVisibility && !el.checkVisibility({visibilityProperty: true})) return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  }
  function path(el) {
    const bits = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
      if (n.id) { bits.unshift('#' + n.id); break; }
      const cls = typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      const sib = n.parentElement ? [...n.parentElement.children].filter(x => x.tagName === n.tagName) : [];
      bits.unshift(n.tagName.toLowerCase() + cls + (sib.length > 1 ? ':nth-of-type(' + (sib.indexOf(n) + 1) + ')' : ''));
    }
    return bits.join(' > ');
  }
  const name = el => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.value || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const look = el => { const s = getComputedStyle(el); return {ow: parseFloat(s.outlineWidth) || 0, os: s.outlineStyle, oc: s.outlineColor, bs: s.boxShadow, bc: [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor], bg: s.backgroundColor}; };
  const calm = new Map();
  window.__kb = {
    // Every control on screen now (and how it looks unfocused); inside an open modal dialog, only its own.
    controls() {
      const modal = [...document.querySelectorAll('[aria-modal=true]')].find(m => shown(m));
      const out = [];
      for (const el of document.querySelectorAll(CONTROLS)) {
        if (!shown(el) || el.disabled || (modal && !modal.contains(el))) continue;
        // tabindex="-1" on something that isn't a control (a view's heading) is a place focus is sent, not a Tab stop
        if (el.getAttribute('tabindex') === '-1' && !el.matches('a[href], button, input, select, textarea, summary, [role]')) continue;
        const p = path(el); if (el !== document.activeElement) calm.set(p, look(el));
        out.push({p, name: name(el), roving: el.getAttribute('tabindex') === '-1' && /^(tab|radio|option|menuitem|gridcell|treeitem)$/.test(el.getAttribute('role') || '') || el.getAttribute('tabindex') === '-1' && !!el.closest('[role=toolbar], [role=tablist], [role=grid], [role=listbox]')});
      }
      return out;
    },
    // Elements given a click handler that a keyboard can't reach, and that aren't inside a control.
    clickOnly() {
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        if (!el.__kbClick || !shown(el) || (el.matches(CONTROLS) && el.tabIndex >= 0)) continue;
        if (el.closest('button, a[href], summary, label, input, textarea, select, [role=button]')) continue;
        out.push(path(el));
      }
      return out;
    },
    // Where focus is, how it shows, and whether it can be seen. The essay text shows its ring on the page around it.
    here() {
      const a = document.activeElement;
      if (!a || a === document.body || a === document.documentElement) return null;
      const ring = a.id === 'ed' ? a.closest('.paper') : a, p = path(a), r = a.getBoundingClientRect(), s = look(ring), u = calm.get(ring === a ? p : path(ring));
      const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(innerWidth, r.right), y1 = Math.min(innerHeight, r.bottom);
      let hidden = 'off screen';
      if (x1 > x0 && y1 > y0) {
        const hit = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === a || a.contains(t) || t.contains(a)); };
        const hits = [hit((x0 + x1) / 2, (y0 + y1) / 2), hit(x0 + 2, y0 + 2), hit(x1 - 2, y1 - 2)];
        hidden = hits.every(Boolean) ? '' : hits.some(Boolean) ? '' : 'covered by ' + path(document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2) || document.body);
      }
      const behind = bgOf(ring.parentElement || ring);
      let kind = 'none', cr = 0;
      if (s.os !== 'none' && s.ow > 0) { kind = s.os === 'auto' ? 'browser' : 'outline'; cr = kind === 'browser' ? 3 : ratio(over(rgba(s.oc), behind), behind); }
      else if (u && s.bs !== u.bs && s.bs !== 'none') { kind = 'shadow'; const m = s.bs.match(/(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]+)/i); cr = m ? ratio(over(rgba(m[1]), behind), behind) : 0; }
      else if (u && JSON.stringify(s.bc) !== JSON.stringify(u.bc)) { kind = 'border'; cr = Math.max(...s.bc.map(c => ratio(over(rgba(c), behind), behind))); }
      else if (u && s.bg !== u.bg) { kind = 'background'; cr = ratio(bgOf(ring), over(rgba(u.bg), behind)); }
      return {p, name: name(a), kind, cr: Math.round(cr * 100) / 100, hidden};
    },
  };
})();
