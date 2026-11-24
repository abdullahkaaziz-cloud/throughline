
const TYPES = {
  contradiction: {label: 'Contradiction', g: 'rel', c: '--rel', rank: 0, rel: true},
  library_clash: {label: 'Library clash', g: 'rel', c: '--rel', rank: 1},
  tension: {label: 'Tension', g: 'rel', c: '--rel', rank: 2, rel: true},
  logic: {label: 'Logic', g: 'logic', c: '--logic', rank: 3},
  evidence: {label: 'Evidence', g: 'evid', c: '--evid', rank: 4},
  clarity: {label: 'Clarity', g: 'clar', c: '--clar', rank: 5},
  grammar: {label: 'Grammar', g: 'gram', c: '--gram', rank: 6},
};
const GROUPS = [['all', 'All'], ['rel', 'Contradictions'], ['logic', 'Logic'], ['evid', 'Evidence'], ['clar', 'Clarity'], ['gram', 'Grammar']];
const LEGEND = [
  ['rel', 'Contradictions', 'Two passages that can’t both be true, joined by a line in the margin. Also clashes with your other essays.'],
  ['logic', 'Logic', 'Leaps, missing steps, and promises the essay doesn’t keep.'],
  ['evid', 'Evidence', 'Claims that need a source or are overstated.'],
  ['clar', 'Clarity', 'Sentences that are hard to follow.'],
  ['gram', 'Grammar', 'Small slips, often with a one-click fix.'],
];
const SW = {
  rel: '<svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true"><path d="M1 4H21" stroke="var(--rel)" stroke-width="2"/></svg>',
  logic: '<svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true"><path d="M1 4q2.5-3.5 5 0t5 0 5 0 5 0" fill="none" stroke="var(--logic)" stroke-width="1.6"/></svg>',
  evid: '<svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true"><path d="M2 4H21" stroke="var(--evid)" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="0.1 4.4"/></svg>',
  clar: '<svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true"><path d="M1 2.5H21M1 5.5H21" stroke="var(--clar)" stroke-width="1.3"/></svg>',
  gram: '<svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true"><path d="M1 4H21" stroke="var(--gram)" stroke-width="1.5"/></svg>',
};
const SEVR = {high: 0, medium: 1, low: 2};
const ASKS = {
  wrong: {label: 'What’s wrong here?', q: 'What, if anything, is wrong with this passage? Check grammar, clarity, logic, evidence, and whether it fits the rest of the essay. If it is fine, say so in one point.'},
  stronger: {label: 'Make it stronger', q: 'How could this passage be stronger? Point to what weakens it (vague or overstated claims, missing evidence, weak links to the argument) and how to fix each.'},
  follow: {label: 'Does it follow?', q: 'Does this passage follow from what comes before it, and does it support the essay’s main claim? Name any missing step or unsupported jump.'},
};
const LIBS = {
  pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfw: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
};
const LKEY = 'throughline.essays.v1', PKEY = 'throughline.prefs.v1';
const REVIEW_RULES = `You are a careful essay editor. You never rewrite the essay: you point to problems and suggest fixes that the writer makes themselves.

Read the whole essay before flagging anything. Then work in four passes:
1. Claims: find the essay's main claims and where each appears.
2. Relations: compare claims about the same subject. Flag
   - "contradiction": two passages of the essay that cannot both be true as written;
   - "tension": two passages that only fit together with an unstated qualification;
   - "library_clash": a passage of the essay that conflicts with a passage in one of the OTHER DOCUMENTS (the writer's earlier essays), if any are given. Only flag views the writer states in their own voice in both places.
3. Other issues: "logic" (a leap, circular reasoning, a promise the essay doesn't keep, an objection left unanswered), "evidence" (an uncited or overstated claim), "clarity" (ambiguous wording, shifting terms, leftover drafting notes), "grammar" (a real error, not a style preference).
4. Verify: re-read both passages of every contradiction, tension or library_clash in context. Drop it if the essay resolves it elsewhere. Do not flag a view the essay attributes to someone else unless the essay also adopts it.

Rules:
- Quote passages exactly, character for character, from the text given: at most 40 words, enough words to be unique, no ellipses, and never the bracketed paragraph numbers.
- passage_b is required for contradiction, tension and library_clash, and null for every other type. For library_clash, passage_b.document is the id of the other document, like "D1".
- Prefer fewer, surer flags: at most 15 issues, at most 5 of them grammar. Give each a confidence from 0 to 1.
- title: 3 to 7 words naming the problem.
- explanation: one or two short sentences on why it matters to a reader.
- fix: one concrete instruction saying what to change. Do not rewrite the writer's paragraph.
- suggestion: only when a small wording change fixes the issue (a grammar fix, a qualifier, a shorter phrase), the exact replacement text for passage_a.quote; otherwise null.
- summary.thesis: the essay's main claim in one sentence. summary.start_with: the most useful thing to fix first, in one sentence.
- Plain English for a student. No markdown.

Reply with only this JSON:
{"summary":{"thesis":"...","start_with":"..."},"issues":[{"type":"contradiction","severity":"high","confidence":0.9,"title":"...","passage_a":{"quote":"..."},"passage_b":{"quote":"...","document":null},"explanation":"...","fix":"...","suggestion":null}]}`;

const SAMPLE_TEXT = [
  'Since 2020, millions of office workers have discovered that they can do their jobs from home. This essay argues that remote work should become the default for knowledge workers, because it improves productivity, widens access to jobs and cuts commuting emissions.',
  'Remote workers are consistently more productive than their office-based colleagues. Without long commutes or constant interruptions, employees can focus for longer stretches and finish tasks faster. Many managers have noticed this improvement first-hand.',
  'Remote work also opens jobs to people who cannot easily travel to an office, such as parents and disabled workers. Companies irregardless of size can hire from a much wider talent pool, which makes teams more diverse.',
  'Yet most companies saw productivity fall after moving to remote work, largely because collaboration and mentoring became harder. Junior staff in particular struggled without the day-to-day guidance that, in an office, they would have been able to receive from more experienced colleagues sitting nearby.',
  'In conclusion, remote work is clearly better for everyone, and governments should require companies to offer it. The benefits for productivity, access and the environment are simply too large to ignore.',
].join('\n\n');
const SAMPLE_REVIEW = {at: 0, by: 'Claude', tier: 'sample', checked: 0,
  summary: {thesis: 'Remote work should become the default for knowledge workers because it improves productivity, widens access to jobs and cuts commuting emissions.', start_with: 'Settle what you claim about productivity: ¶2 says remote workers are more productive, while ¶4 says productivity fell.'},
  issues: [
    {id: 's1', type: 'contradiction', severity: 'high', confidence: 0.9, title: 'Your productivity claims clash', qa: 'Remote workers are consistently more productive than their office-based colleagues.', qb: 'most companies saw productivity fall after moving to remote work', explanation: 'If most companies lost productivity, remote workers weren’t consistently more productive. A marker will notice, and it undercuts your first reason.', fix: 'Decide what you mean (gains on focused solo work, an early dip that recovered, or it depends on the role) and qualify ¶2 to match.', suggestion: 'Remote workers are often more productive than their office-based colleagues on focused, individual tasks.'},
    {id: 's2', type: 'tension', severity: 'medium', confidence: 0.8, title: '“Better for everyone” vs struggling juniors', qa: 'remote work is clearly better for everyone', qb: 'Junior staff in particular struggled', explanation: 'Your fourth paragraph shows a group it isn’t better for, so “everyone” overreaches.', fix: 'Narrow the claim to the people your evidence covers, or explain how junior staff can be supported remotely.', suggestion: 'remote work is better for most experienced knowledge workers'},
    {id: 's3', type: 'logic', severity: 'medium', confidence: 0.85, title: 'Emissions promised, never argued', qa: 'cuts commuting emissions', explanation: 'The introduction promises an argument about emissions, but no paragraph makes it, and the conclusion repeats the claim.', fix: 'Add a short paragraph with evidence on commuting emissions, or drop it from the introduction and the conclusion.', suggestion: null},
    {id: 's4', type: 'logic', severity: 'medium', confidence: 0.8, title: 'New claim in the conclusion', qa: 'governments should require companies to offer it', explanation: 'A legal requirement is a much bigger claim than “remote work should be the default”, and nothing earlier argues for it.', fix: 'End on the claim you defended, or argue for regulation in the body first.', suggestion: null},
    {id: 's5', type: 'evidence', severity: 'medium', confidence: 0.8, title: '“Many managers” needs a source', qa: 'Many managers have noticed this improvement first-hand.', explanation: 'This is anecdote presented as a general fact. Which managers, and how many?', fix: 'Cite a survey or study, or present it as one example.', suggestion: null},
    {id: 's6', type: 'logic', severity: 'low', confidence: 0.7, title: 'Missing step to “more diverse”', qa: 'which makes teams more diverse', explanation: 'A wider talent pool makes diverse hiring possible, but it doesn’t guarantee it.', fix: 'Soften the claim, or add evidence that remote hiring did diversify teams.', suggestion: 'which can make teams more diverse'},
    {id: 's7', type: 'clarity', severity: 'low', confidence: 0.7, title: 'Long-winded ending to ¶4', qa: 'without the day-to-day guidance that, in an office, they would have been able to receive from more experienced colleagues sitting nearby', explanation: 'The phrase is long for a simple point, so the reader loses the thread.', fix: 'Cut it to the essential idea.', suggestion: 'without day-to-day guidance from experienced colleagues nearby'},
    {id: 's8', type: 'grammar', severity: 'low', confidence: 0.95, title: '“Irregardless” → “regardless”', qa: 'irregardless', explanation: '“Irregardless” is non-standard, and markers count it as an error.', fix: 'Use “regardless”.', suggestion: 'regardless'},
  ]};

const $ = (s, r = document) => r.querySelector(s);
const ed = $('#ed'), back = $('#backdrop'), gut = $('#gutter'), paper = $('#paper'), titleIn = $('#title'), metaEl = $('#meta');
const rail = $('#rail'), rbody = $('#rbody'), chipsEl = $('#chips'), rcount = $('#rcount'), selbar = $('#selbar'), selq = $('#selq');
const toastEl = $('#toast'), fileIn = $('#file'), reviewBtn = $('#reviewBtn'), docBtn = $('#docBtn'), aiBtn = $('#aiBtn');
const docMenu = $('#docMenu'), aiMenu = $('#aiMenu'), reader = $('#reader'), dropEl = $('#drop');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const narrow = matchMedia('(max-width: 1000px)');
const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (ios) { back.style.paddingLeft = '3px'; back.style.paddingRight = '3px'; }

const st = {docs: new Map(), cur: null, filter: 'all', active: null, hover: null, anchors: new Map(), pstarts: [],
  asks: new Map(), askHover: null, reviewing: null, reviewError: null, tier: 'complex', useLib: true, store: 'none',
  loaded: false, touched: false, isOwner: false, ai: 'pending', aiWhy: '', tiers: null, sel: null, lastSig: '', readOnly: false, saveText: ''};
let sampleFn = null, col = null;
try { const p = JSON.parse(localStorage.getItem(PKEY) || '{}'); if (p.tier === 'default' || p.tier === 'complex') st.tier = p.tier; if (typeof p.useLib === 'boolean') st.useLib = p.useLib; } catch (e) {}
function savePrefs() { try { localStorage.setItem(PKEY, JSON.stringify({tier: st.tier, useLib: st.useLib})); } catch (e) {} }

