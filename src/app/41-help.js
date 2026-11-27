// ---- help: what each part of Throughline does, each with a short clip from the walkthrough ----
// The clips and their captions ship with the page as its own files (help/<id>.mp4 and help/<id>.vtt), cut from the
// walkthrough, which was filmed on made-up demo essays. A clip loads only when someone presses Watch.
const helpEl = $('#help');
const HELP = [
  ['Writing and reviewing', [
    ['review', 'Review', 'Press Review, or ' + (mac ? '⌘' : 'Ctrl') + '+Enter. Claude reads the whole essay and marks what needs work right where it is, most important first. It never rewrites your essay.'],
    ['fix', 'Fixing what a note found', 'Open a note to see why it matters and what to try. Apply a suggested wording, change the passage yourself, or dismiss the note. Review again, and only the paragraphs you changed are re-checked.'],
    ['ask', 'Asking about a passage', 'Select any sentence to ask what’s wrong with it, how to make it stronger, or whether it follows. Or type your own question.'],
    ['drafts', 'Drafts and Compare', 'Each review keeps a draft. The strip of drafts shows what each review found and what you fixed, and Compare lines up any two.']]],
  ['Checking against your sources', [
    ['sources', 'Sources and the brief', 'Add the papers you use and your assignment brief in Sources. Reviews then check your claims and citations against them, and how much of the brief you cover.'],
    ['library', 'Your other essays', 'Every essay you add joins your library, and a review also checks whether you said the opposite in another one.'],
    ['terms', 'Consistent terms', 'The Terms tab finds ideas written more than one way, so you can keep one form everywhere.']]],
  ['Seeing the shape of your argument', [
    ['argument', 'The Argument tab', 'What each paragraph does (claim, evidence, objection, reply) and the weak points in how they hang together.'],
    ['loom', 'The loom', 'Your ideas as threads through the paragraphs: where each is woven in, where two pull against each other, and which ones you drop. In More.'],
    ['build', 'Build-up', 'How your essay leads a reader to its point, paragraph by paragraph, and what to change first. In More.']]],
  ['Before you write', [
    ['board', 'Plan: the brainstorm board', 'Angles, objections, questions and passages from your sources, as cards to keep, bin or put into an outline. Start writing turns the outline into headings.'],
    ['grow', 'Grow', 'Think an idea through one question at a time: why, what you mean, who disagrees, what follows.'],
    ['unfold', 'Unfold', 'Your answers at five levels of detail, from one line to a full plan, with the gaps marked.']]],
  ['Across your essays', [
    ['map', 'Map', 'How all your essays and sources connect: themes, clashes, and questions you haven’t settled.'],
    ['defend', 'Defend it', 'A short viva on your essay’s weakest points, after a review. Answer by typing or speaking.'],
    ['record', 'Writing record', 'How an essay was written: time, typed and pasted text, drafts, vivas and AI use. In More.'],
    ['progress', 'Your progress', 'How your writing changes from essay to essay, and the habits behind your notes. In More.']]]];
// Clip lengths in seconds, for the Watch buttons.
const CLIP_S = {review: 27, fix: 13, ask: 11, drafts: 14, sources: 16, library: 10, terms: 15, argument: 18, loom: 19, build: 18, board: 18, grow: 16, unfold: 14, map: 19, defend: 29, record: 17, progress: 18};
// Whether the clips are published beside the page: Help shows Watch buttons only if they are.
let clipsOk = null;
function checkClips() {
  if (clipsOk !== null) return;
  clipsOk = 'checking';
  fetch('help/review.vtt', {method: 'HEAD', cache: 'no-store'}).then(r => r.ok, () => false).then(ok => { clipsOk = ok; if (st.mode === 'help') renderHelp(); });
}
function openHelp() { closeMenus(); checkClips(); setMode('help'); }
function clipEl(id, title) {
  if (clipsOk !== true) return null;
  const box = h('div', {class: 'hclip'});
  const watch = h('button', {class: 'btn sm', type: 'button', id: 'clip-' + id, onclick: () => {
    const v = h('video', {controls: true, autoplay: true, playsinline: true, preload: 'auto', src: 'help/' + id + '.mp4', 'aria-label': title + ', a short clip with captions'},
      h('track', {kind: 'captions', src: 'help/' + id + '.vtt', srclang: 'en', label: 'English', default: true}));
    v.addEventListener('error', () => fill(box, h('p', {class: 'smeta'}, 'This clip isn’t available here.')));
    const card = box.closest('.hitem'); if (card) card.classList.add('playing');
    fill(box, v); v.focus({preventScroll: true}); v.scrollIntoView({block: 'nearest', behavior: reduce ? 'auto' : 'smooth'});
  }}, h('span', {html: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="currentColor"/></svg>'}), 'Watch' + (hasOwn(CLIP_S, id) ? ' · ' + CLIP_S[id] + ' s' : ''));
  box.append(watch);
  return box;
}
function renderHelp() {
  if (st.mode !== 'help') return;
  const key = (k, what) => h('li', null, h('kbd', null, k), h('span', null, what));
  fill(helpEl,
    h('div', {class: 'chead2'}, h('button', {class: 'btn sm ghost', type: 'button', onclick: () => setMode('write')}, '← Back to the essay'), h('h2', null, 'Help')),
    h('p', {class: 'rsub'}, 'Throughline marks what needs work in your essay and never rewrites it. Here’s what each part does' + (clipsOk === true ? ', each with a clip of about 20 seconds.' : '.')),
    HELP.map(([sec, items]) => h('section', {class: 'rsec'}, h('h3', null, sec),
      h('div', {class: 'hgrid2'}, items.map(([id, title, text]) => h('article', {class: 'hitem'}, h('h4', null, title), h('p', null, text), clipEl(id, title)))))),
    h('section', {class: 'rsec'}, h('h3', null, 'Keys'),
      h('ul', {class: 'hkeys'}, key((mac ? '⌘' : 'Ctrl') + '+Enter', 'Review the essay'), key((mac ? '⌘' : 'Ctrl') + '+Z', 'Undo: in the essay, your last change, including anything Throughline put in; anywhere else, what you just dismissed or deleted'),
        key('Esc', 'Close what’s open, or go back to the essay'), key('← →', 'Read a chart or a strip of drafts, one step at a time'))),
    h('section', {class: 'rsec'}, h('h3', null, 'More'),
      h('div', {class: 'wacts'},
        h('button', {class: 'btn sm', type: 'button', id: 'helpTour', onclick: () => { setMode('write'); restartTour(); }}, 'Show me around again'),
        h('button', {class: 'btn sm', type: 'button', onclick: openPrivacy}, 'Privacy and your data'),
        st.isOwner ? null : h('button', {class: 'btn sm', type: 'button', onclick: openFeedback}, 'Send feedback'))));
}
