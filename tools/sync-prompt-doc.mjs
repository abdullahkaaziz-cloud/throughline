// Regenerates docs/review-prompt.md, docs/argument-prompt.md and docs/brainstorm-prompt.md from the prompts in src/app/00-config.js
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
fs.writeFileSync(new URL('docs/brainstorm-prompt.md', root), brainstorm);
console.log('docs/review-prompt.md, docs/argument-prompt.md and docs/brainstorm-prompt.md updated');
