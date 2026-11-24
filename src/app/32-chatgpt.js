// ---- Throughline on your own computer: the person's ChatGPT plan through Sign in with ChatGPT ----
// Only in the local app (local/server.mjs marks the page with window.TL_LOCAL). The page never sees a token: it
// asks the local server, which keeps the sign-in in memory and talks to OpenAI. Essays stay in this browser.
const LOCAL_TAGS = {connected: 'Connected. Reviews now run on your ChatGPT plan.', allow: 'You signed in, but didn’t allow Throughline to use your ChatGPT plan.',
  declined: 'Sign-in was cancelled.', error: 'ChatGPT sign-in didn’t finish. Try again.'};
async function localApi(path, body, signal) {
  const init = {method: body ? 'POST' : 'GET', headers: {'x-throughline-key': LOCAL.key}, cache: 'no-store', credentials: 'same-origin', signal};
  if (body) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(path, init); } catch (e) { throw signal && signal.aborted ? {code: 'cancelled'} : {code: 'local_offline', message: 'Throughline on this computer has stopped. Start it again, then reload this page.'}; }
  if (res.ok && !res.headers.get('content-type')?.startsWith('application/x-ndjson')) return res.json();
  if (res.ok) return res;
  let d = null; try { d = await res.json(); } catch (e) {}
  throw localErr(d);
}
function localErr(d) {
  const e = plainObj(plainObj(d).error);
  return {code: typeof e.code === 'string' ? e.code.slice(0, 80) : 'upstream_error', message: typeof e.message === 'string' ? e.message.slice(0, 300) : 'Something went wrong. Try again.'};
}
// The same shape as the Claude runtime's `sample`: call it for {text}, or .json for a parsed answer.
function chatgptSample() {
  const call = async (input, opts = {}) => {
    const msgs = typeof input === 'string' ? input : (Array.isArray(input) ? input : []).map(m => ({role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content)}));
    const res = await localApi('/api/ai', {input: msgs}, opts.signal);
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '', text = '', done = false;
    try {
      for (;;) {
        const {value, done: end} = await reader.read();
        if (end) break;
        buf += dec.decode(value, {stream: true});
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          let ev; try { ev = JSON.parse(line); } catch (e) { throw {code: 'upstream_error', message: 'The reply from ChatGPT was garbled. Try again.'}; }
          if (typeof ev.d === 'string') { text += ev.d; if (opts.onText) opts.onText({text, delta: ev.d}); }
          else if (ev.done === true) done = true;
          else if (ev.error) throw localErr(ev);
        }
      }
    } catch (e) { if (opts.signal && opts.signal.aborted) throw {code: 'cancelled'}; throw e; }
    if (!done) throw {code: 'upstream_error', message: 'The connection to ChatGPT dropped. Try again.'};
    return {text, truncated: false};
  };
  const fn = (input, opts) => call(input, opts);
  fn.json = async (input, opts) => parseJsonReply((await call(input, opts)).text);
  fn.limits = async () => ({maxPromptBytes: 1000000, modelTiers: ['default', 'complex']});
  return fn;
}
function cleanGpt(x) {
  const g = plainObj(x), models = (Array.isArray(g.models) ? g.models : []).slice(0, 50).map(m0 => { const m = plainObj(m0);
    return typeof m.slug === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(m.slug) ? {slug: m.slug, name: clip(m.name, 120) || m.slug} : null; }).filter(Boolean);
  return {state: ['connected', 'scope_missing', 'reauth_required', 'signed_out'].includes(g.state) ? g.state : 'signed_out', email: clip(g.email, 200), models,
    model: models.some(m => m.slug === g.model) ? g.model : null, usageUrl: typeof g.usageUrl === 'string' && /^https:\/\/chatgpt\.com\//.test(g.usageUrl) ? g.usageUrl : 'https://chatgpt.com/settings/usage'};
}
async function initLocal() {
  $('#aiName').textContent = AI;
  // A normal page can save files itself (the writing record's Download).
  st.dl = {save: async ({filename, data}) => {
    const url = URL.createObjectURL(new Blob([data], {type: /\.html$/.test(filename) ? 'text/html' : 'text/plain'}));
    const a = h('a', {href: url, download: String(filename).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').slice(0, 120)});
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    return {status: 'saved'};
  }};
  const tag = (location.hash.match(/^#chatgpt=(\w+)$/) || [])[1];
  if (tag) history.replaceState(null, '', location.pathname);
  await refreshLocal();
  if (tag && hasOwn(LOCAL_TAGS, tag)) toast(tag === 'error' && st.gpt.error ? st.gpt.error : LOCAL_TAGS[tag]);
}
async function refreshLocal() {
  let d = null, err = '';
  try { d = await localApi('/api/state'); } catch (e) { err = e.message || ''; }
  st.gpt = Object.assign(cleanGpt(d && d.chatgpt), {error: d && d.chatgpt && d.chatgpt.error ? clip(plainObj(d.chatgpt.error).message, 300) : '', offline: !d});
  const g = st.gpt;
  if (g.state === 'connected') { sampleFn = chatgptSample(); st.ai = 'ready'; st.aiWhy = ''; }
  else {
    sampleFn = null; st.ai = 'off';
    st.aiWhy = g.offline ? err || 'Throughline on this computer has stopped.' : g.state === 'scope_missing' ? 'Allow Throughline to use your ChatGPT plan to run reviews.'
      : g.state === 'reauth_required' ? 'Your ChatGPT sign-in has expired. Continue with ChatGPT again.' : 'Continue with ChatGPT to run reviews on your own plan.';
  }
  renderAiBtn(); setReviewBtn();
  if (!aiMenu.hidden) renderAiMenu();
}
async function connectChatGPT(reconsent) {
  closeMenus();
  // Save what's pending first: signing in leaves this page for a moment.
  for (const d of st.docs.values()) if (!d.unsaved) { clearTimeout(pending.get(d.id)); pending.delete(d.id); flush(d.id); }
  try {
    const d = await localApi('/api/chatgpt/connect', {reconsent: !!reconsent});
    if (typeof d.url === 'string' && (/^https:\/\/auth\.openai\.com\//.test(d.url) || /^http:\/\/127\.0\.0\.1:\d+\//.test(d.url))) location.assign(d.url);
    else toast('ChatGPT sign-in couldn’t start. Try again.');
  } catch (e) { toast(e.message || 'ChatGPT sign-in couldn’t start. Try again.'); }
}
async function disconnectChatGPT() {
  try { const d = await localApi('/api/chatgpt/disconnect', {}); toast(d.revoked === false ? 'Disconnected here. ChatGPT couldn’t confirm it, so check Settings → Apps in ChatGPT.' : 'Disconnected from ChatGPT.'); }
  catch (e) { toast(e.message || 'Couldn’t disconnect. Try again.'); }
  refreshLocal();
}
async function setGptModel(slug) {
  try { await localApi('/api/chatgpt/model', {model: slug}); } catch (e) { toast(e.message || 'Couldn’t change the model.'); }
  refreshLocal();
}
function renderLocalAiMenu() {
  const g = st.gpt || cleanGpt(null), on = g.state === 'connected';
  const sub = on ? 'Your ChatGPT plan · ' + (g.email || 'connected') : g.offline ? 'Throughline on this computer has stopped'
    : g.state === 'scope_missing' ? 'Signed in, but using your plan wasn’t allowed' : g.state === 'reauth_required' ? 'Your sign-in has expired' : 'Not connected';
  fill(aiMenu,
    h('div', {class: 'msec'}, 'Who reviews your writing'),
    h('div', {class: 'prov'}, h('span', {class: 'pdot', data: {s: on ? 'ready' : 'off'}}), h('span', {class: 'mt'}, h('b', null, 'ChatGPT'), h('span', {class: 'sub'}, sub))),
    on && g.models.length ? h('label', {class: 'flab mpad'}, h('span', null, 'Model'),
      h('select', {id: 'gptModel', onchange: e => setGptModel(e.target.value)}, g.models.map(m => h('option', {value: m.slug, selected: m.slug === g.model}, m.name)))) : null,
    h('div', {class: 'gacts'}, on
      ? [h('a', {class: 'btn sm', href: g.usageUrl, target: '_blank', rel: 'noopener noreferrer'}, 'Manage usage'), h('button', {class: 'btn sm ghost', type: 'button', id: 'gptDisconnect', onclick: disconnectChatGPT}, 'Disconnect')]
      : g.offline ? null : h('button', {class: 'btn sm primary', type: 'button', id: 'gptConnect', onclick: () => connectChatGPT(g.state === 'scope_missing')}, g.state === 'scope_missing' ? 'Allow plan use' : 'Continue with ChatGPT')),
    h('p', {class: 'mnote'}, 'Throughline is running on this computer. Reviews use your own ChatGPT plan (Plus or Pro), and your essays and sign-in stay on this computer. Closing Throughline signs you out.'),
    h('div', {class: 'msec'}, 'Claude'),
    h('p', {class: 'mnote'}, 'To use your Claude plan instead, open the version of Throughline that runs inside Claude.'),
    h('button', {class: 'mi', onclick: () => { closeMenus(); openSources(); }}, h('span', {class: 'mt'}, h('b', null, 'Sources and past essays'), h('span', {class: 'sub'}, 'Choose what reviews of this essay check against'))));
}
