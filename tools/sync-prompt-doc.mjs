// Regenerates docs/review-prompt.md from REVIEW_RULES in src/app/00-config.js (the code is the source of truth).
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const rules = fs.readFileSync(new URL('src/app/00-config.js', root), 'utf8').match(/const REVIEW_RULES = `([\s\S]*?)`;/)[1];
const doc = `# Review prompt

Every AI provider gets the same instructions. The source of truth is \`REVIEW_RULES\` in \`src/app/00-config.js\`; regenerate this file with \`node tools/sync-prompt-doc.mjs\` (a unit test checks they match).

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

Text inside every block is "fenced": a "<" that would open or close a document, brief, essay or claims block is replaced with "‹", so a source can't break out of its block. The app then checks every quote in the answer against the real text and drops anything it can't find, any unknown type, and any note with confidence below 0.3.

## Rules

\`\`\`
${rules}
\`\`\`
`;
fs.writeFileSync(new URL('docs/review-prompt.md', root), doc);
console.log('docs/review-prompt.md updated');
