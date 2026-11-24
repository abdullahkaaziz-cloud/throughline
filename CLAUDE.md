# Throughline: notes for Claude

A visual essay editor. The AI review marks problems in place and never rewrites the essay. It runs as a claude.ai artifact page.

## Layout
- `src/index.html` is the page shell and `src/styles.css` holds the styles.
- `src/lib.js` holds the text helpers (reflow, quote anchoring, diff). The Node tools use them too.
- `src/app/NN-*.js` is the app code. The files are concatenated in name order inside one block scope, so function declarations hoist across files, but `const` values must exist before load-time code uses them.
- `tools/build.mjs` builds `dist/index.html`, one self-contained page.
- `tools/test_app.py` runs headless Chrome tests against a mocked runtime (`tools/mock.js`). `tools/dump_pdf.py` checks PDF import.
- `docs/review-prompt.md` must stay in sync with `REVIEW_RULES` in `src/app/00-config.js`.

## Build and test
Run `npm install`, then `node tools/build.mjs`, then `python3 tools/test_app.py`. The tests need Playwright and Chrome at `/usr/bin/google-chrome`.

Optional private test data is gitignored: `test/fixtures/*.pdf` and `seed/test-essays.json`. If it's missing, those steps are skipped.

## Publish
- **App:** artifact slug `09021979-394b-4c68-be40-8f3af9c78303` (https://claude.ai/artifact/27X1wxt4QTTi1oxFRun3VU). Build first. Get `base_version` from `get_artifact`, then `publish_files` with `mode: "patch"` and only `[{as: "index.html", path: "<repo>/dist/index.html"}]`. `seed/test-essays.json` is already on the artifact, so don't re-send it.
- **Capabilities:** `{sample:{}, db:{}, user:{}}`. When adding a capability, declare it first, then publish the code that uses it.
- **Mockups:** design canvas slug `8314b750-d52b-4f2c-a0e2-6ec07b031db4` (https://claude.ai/artifact/HBp9wn9DgjAvdjWxKyRXfZ).
- **Plans:** see `ROADMAP.md`.

## Rules
- The repo is public. Never commit essays, PDFs, `seed/` or notes about the owner's essays.
- Model output, file text and database data are data, never markup. Build DOM with `h()` or `textContent`. `innerHTML` is only for the fixed icon strings in `00-config.js`.
- **Storage:** each user's essays live at `data/users/<await user.id()>/<docId>`. Write one document at a time; `persist()` debounces and chains the writes.
- **Editor:** a transparent `<textarea id="ed">` sits over a marked-up copy (`#backdrop`). Any text style goes on `.txt` so both keep identical metrics, and the textarea never scrolls internally.
- **Visual language:**
  - contradiction: rust `--rel`, solid underline, plus a margin line;
  - tension: dashed rust;
  - logic: wavy violet;
  - evidence: dotted teal;
  - clarity: double blue;
  - grammar: thin slate.

  The type is Inter for the UI and Source Serif 4 for the essay, with light and dark themes via `light-dark()`.
