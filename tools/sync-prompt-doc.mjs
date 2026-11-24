// Regenerates the prompt docs in docs/ from the prompts in src/app/00-config.js
// (the code is the source of truth). Run: npm run sync-prompt-doc. A unit test checks they match.
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const cfg = fs.readFileSync(new URL('src/app/00-config.js', root), 'utf8');
const rules = name => cfg.match(new RegExp('const ' + name + ' = `([\\s\\S]*?)`;'))[1];
const FENCE = 'Text inside every block is "fenced": a "<" that would open or close a document, brief, essay or claims block is replaced with "‹", so a document can\'t break out of its block.';

const review = `# Review prompt

Every AI provider gets the same instructions. The source of truth is \`REVIEW_RULES\` in \`src/app/00-config.js\`; regenerate this file with \`npm run sync-prompt-doc\` (a unit test checks they match).

After the rules, the app sends:

\`\`\`
ESSAY TITLE: <title>

BRIEF (the assignment question or marking criteria):      <- only when the essay has one
<brief>
<brief text>
</brief>

ESSAY (each paragraph starts with its number in brackets; never include these numbers in a quote):
[1] <paragraph>

OTHER DOCUMENTS (role "essay": the writer's earlier essays; role "source": material the writer uses):
<document id="D1" role="source" title="<title>" content="full text | main claims only">
<the text, or the document's claims index: "c1: claim" lines with exact quotes>
</document>
\`\`\`

${FENCE} The app then checks every quote in the answer against the real text and drops anything it can't find, any unknown type, and any note with confidence below 0.3.

## Rules

\`\`\`
${rules('REVIEW_RULES')}
\`\`\`

## Re-checks

When the essay was reviewed before and only a few paragraphs changed (and its brief and documents didn't), the next review is a re-check. The changed paragraphs go in full with a star (\`[7*]\`), along with their neighbours and any paragraph the last review tied to them; the rest go in as their first sentence, marked "(in short)". These rules follow the review rules, and the app then keeps only new notes that involve a changed paragraph, and carries over the earlier notes whose passages are untouched.

\`\`\`
${rules('RECHECK_RULES')}
\`\`\`
`;

const argument = `# Argument map prompt

The Argument view asks for this map only when the writer presses "Map the argument". The source of truth is \`ARG_RULES\` in \`src/app/00-config.js\`; regenerate this file with \`npm run sync-prompt-doc\` (a unit test checks they match).

After the rules, the app sends:

\`\`\`
ESSAY TITLE: <title>

ESSAY TO MAP (each paragraph starts with its number in brackets):
<essay>
[1] <paragraph>
</essay>
\`\`\`

${FENCE} The app keeps only paragraph numbers that exist, roles and problem kinds from its own lists, and a thesis quote it can find in the essay, and caps every text field (\`validateArgmap\` in \`src/lib.js\`).

## Rules

\`\`\`
${rules('ARG_RULES')}
\`\`\`
`;
const brainstorm = `# Brainstorm prompt

The brainstorm board asks for cards only when the writer presses "Suggest ideas" or "More ideas". The source of truth is \`IDEA_RULES\` in \`src/app/00-config.js\`; regenerate this file with \`npm run sync-prompt-doc\` (a unit test checks they match).

After the rules, the app sends:

\`\`\`
ESSAY TITLE: <title>

QUESTION:
<question>
<the question the essay answers>
</question>

BRIEF (the assignment question or marking criteria):      <- only when the essay has one
<brief>
<brief text>
</brief>

PLAN (the writer's cards so far):
<plan>
OUTLINE, CARDS ON THE BOARD and BINNED CARDS, as "- (kind) text" lines, with the writer's answers to question cards
</plan>

DOCUMENTS (role "source": material the writer uses; role "essay": the writer's earlier essays):
<document id="D1" role="source" title="<title>" content="full text | main claims only">
<the text, or the document's claims index>
</document>
\`\`\`

${FENCE} The app keeps only known kinds of card, drops anything the writer already has, keeps a source card only when its quote is really in that document, and caps every field (\`validateIdeas\` in \`src/lib.js\`). "Start writing" adds the outline to the essay as headings, never as prose.

## Rules

\`\`\`
${rules('IDEA_RULES')}
\`\`\`
`;
fs.writeFileSync(new URL('docs/review-prompt.md', root), review);
fs.writeFileSync(new URL('docs/argument-prompt.md', root), argument);
const map = `# Research map prompt

The research map asks for a map only when the writer presses "Map my work" or "Map again". The source of truth is \`MAP_RULES\` in \`src/app/00-config.js\`; regenerate this file with \`npm run sync-prompt-doc\` (a unit test checks they match).

Long documents are first read once into their claims index (cached by text hash). After the rules, the app sends every essay and source, each in its own block:

\`\`\`
DOCUMENTS (role "essay": the writer's own essays; role "source": material they use):
<document id="D1" role="essay" title="<title>" content="full text | main claims only">
<the text, or the document's claims index: "c1: claim" lines with exact quotes>
</document>
\`\`\`

${FENCE} The app keeps only documents it sent, puts each document in at most one theme, keeps link kinds from a fixed list, and keeps a link only when its passages are really in those documents (a "cites" or "builds_on" link may name only its own side). It also caps every field (\`validateRmap\` in \`src/lib.js\`).

## Rules

\`\`\`
${rules('MAP_RULES')}
\`\`\`
`;
fs.writeFileSync(new URL('docs/brainstorm-prompt.md', root), brainstorm);
const style = name => cfg.match(new RegExp(name + ": \\{label: '[^']*', rule: '([^']*)'\\}"))[1];
const defend = `# Viva prompts ("Defend it")

A viva runs only when the writer presses "Start the viva" and then submits each answer. The sources of truth are \`EXAM_RULES\` and \`JUDGE_RULES\` in \`src/app/00-config.js\`; regenerate this file with \`npm run sync-prompt-doc\` (a unit test checks they match). Each prompt also carries one line for the examiner the writer chose:

- Supportive tutor: ${style('tutor')}
- Tough examiner: ${style('tough')}

## Setting the questions

After the rules (with \`{n}\` replaced by 3, 5 or 8), the app sends the essay, numbered by paragraph, and any weak points found earlier: the argument map's problems and the review's open notes.

\`\`\`
ESSAY (each paragraph starts with its number in brackets; never include these numbers in a quote):
<essay>
[1] <paragraph>
</essay>

NOTES (weak points found earlier):
<notes>
- (gap) ¶4, ¶5: <note>
</notes>
\`\`\`

The app keeps distinct questions only, at most the number asked for, and a question's quote only when it is really in the essay (\`validateExam\` in \`src/lib.js\`).

\`\`\`
${rules('EXAM_RULES')}
\`\`\`

## Judging an answer

The essay goes in around the passage the question is about: the opening paragraph, that paragraph and its neighbours in full, the rest as first sentences. A follow-up also carries the question and answer before it.

\`\`\`
QUESTION:
<question>
<the question>
(A good answer must show: <what>)
</question>

ANSWER:
<answer>
<the writer's answer, typed or dictated>
</answer>
\`\`\`

The app keeps only the three verdicts, asks at most one follow-up per question, and never follows up a strong answer (\`validateJudge\` in \`src/lib.js\`).

\`\`\`
${rules('JUDGE_RULES')}
\`\`\`
`;
const progress = `# Habits prompt ("Your progress")

The progress view works out its numbers on the device. Claude is asked only when the writer presses "Find my habits". The source of truth is \`HABIT_RULES\` in \`src/app/00-config.js\`; regenerate this file with \`npm run sync-prompt-doc\` (a unit test checks they match).

After the rules (with \`{n}\` replaced by 5), the app sends the notes from the first and latest reviews of the writer's last 12 reviewed essays, at most 160 of them, oldest first, each with an id:

\`\`\`
NOTES (from the reviews of 4 essays, oldest first):
<notes>
N1 [Evidence · essay “<title>” · Nov 2026] <note title> — “<the passage it is about>”
</notes>
\`\`\`

${FENCE} The app keeps a habit only when it cites at least two of the notes it was sent and its group is a known one (or can be taken from its notes), drops repeats, and keeps at most five (\`validateHabits\` in \`src/lib.js\`). It stores each habit with the essays and passages its notes point to, so the writer can open them.

\`\`\`
${rules('HABIT_RULES')}
\`\`\`
`;
fs.writeFileSync(new URL('docs/map-prompt.md', root), map);
fs.writeFileSync(new URL('docs/progress-prompt.md', root), progress);
fs.writeFileSync(new URL('docs/defend-prompt.md', root), defend);
console.log('prompt docs updated');
