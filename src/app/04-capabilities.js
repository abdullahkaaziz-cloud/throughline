// ---- capabilities: Claude on the viewer's own plan, private storage, who is viewing ----
const use = n => { try { return window.claude && typeof window.claude.use === 'function' ? Promise.resolve(window.claude.use(n)).catch(() => null) : Promise.resolve(null); } catch (e) { return Promise.resolve(null); } };
let dbApi = null, myId = null, myName = '';
async function initCaps() {
  const [s, d, u] = await Promise.all([use('sample'), use('db'), use('user')]);
  sampleFn = s || null;
  st.ai = sampleFn ? 'ready' : 'off';
  if (!sampleFn) st.aiWhy = 'AI review isn’t available in this view.';
  if (sampleFn && typeof sampleFn.limits === 'function') { try { const lim = await sampleFn.limits(); if (lim && Array.isArray(lim.modelTiers)) st.tiers = lim.modelTiers; } catch (e) {} }
  if (u) { try { st.isOwner = !!(await u.isOwner()); } catch (e) {} }
  let uid = null; if (u) { try { uid = await u.id(); } catch (e) {} }
  if (u) { try { const me = await u.me(); myName = me && typeof me.name === 'string' ? me.name.slice(0, 80) : ''; } catch (e) {} }
  dbApi = d || null; myId = uid && safeId(String(uid)) ? String(uid) : null;
  if (d && uid) startDb(d, uid); else startLocal();
  renderAiBtn(); setReviewBtn(); renderRail();
}

