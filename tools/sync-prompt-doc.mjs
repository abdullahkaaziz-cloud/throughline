// Regenerates docs/review-prompt.md and docs/argument-prompt.md from the prompts in src/app/00-config.js
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
fs.writeFileSync(new URL('docs/review-prompt.md', root), review);
fs.writeFileSync(new URL('docs/argument-prompt.md', root), argument);
console.log('docs/review-prompt.md and docs/argument-prompt.md updated');
