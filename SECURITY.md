# Security

Please report a vulnerability privately through GitHub's **Report a vulnerability** button (Security tab), not as a public issue.

## How Throughline protects your writing

- **Storage:** essays and sources live in each viewer's own space in the page's database (`data/users/<id>/`). Under the app's rules, other viewers can't read it, and only the owner can write anywhere outside a viewer's own space.
- **AI:** calls run on the viewer's own Claude plan through the artifact runtime. The page holds no API keys, and its content security policy blocks requests to any other server.
- **Untrusted text:** anything from files, storage or the AI is treated as data. It is rendered as text, never as HTML.
- **Voice:** a viva's spoken answers come through the platform's dictation, which holds the microphone and hands the page words, never sound. Questions are read aloud by the platform's speech. Both are optional and switched off by the viewer's own permissions.
- **Testers:** each person's essays live in their own `data/users/<id>/` space, which the database keeps private even from the app's owner. Feedback is the one thing a tester writes where the owner can read it, and the feedback box says so. Someone with view-only access works from browser storage instead.
- **Writing record:** it's kept with the essay in the viewer's own space. The downloaded copy is built from escaped text, so nothing in an essay or a title can become markup or script in it.
- **Checking the AI's answers:** every quote must be found in the real text, paragraph numbers must exist in the essay, and types, values and lengths are checked and capped. Anything that fails is dropped.
- **Prompt fences:** source text is fenced inside prompts, so a document can't close its block or pose as instructions. The prompts also tell the model to ignore instructions found inside documents.
- **Third-party code:** pdf.js and mammoth load only at pinned versions with Subresource Integrity hashes. A tampered file is refused, and the tests prove it.
- **Limits:** uploads are capped at 25 MB, stored text at 200,000 characters, and prompts at 240 KB.
- **Build pipeline:** CI uses actions pinned to commit SHAs, a read-only token, and `npm ci --ignore-scripts`. Dependabot proposes updates. A unit test fails if a library changes without a new integrity hash.
