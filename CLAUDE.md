# Throughline: notes for Claude

A visual essay editor. The AI review marks problems in place and never rewrites the essay. It runs as a claude.ai artifact page.

## Layout
- `src/index.html` is the page shell and `src/styles.css` holds the styles.
- `src/lib.js` holds the pure helpers: reflow, quote anchoring, diff, id and prompt hygiene (`safeId`, `cleanFlags`, `fence`), and model-output validation (`parseReview`, `validateIndex`, `planContext`). It has unit tests.
- `src/app/NN-*.js` is the app code. The files are concatenated in name order inside one block scope:
  - `00`–`17`: core;
  - `20` library (per-essay switches, brief);
  - `21` claims index;
  - `22` sources panel;
  - `23` source chips;
  - `24` argument flow (the Argument tab, the margin thread);
  - `25` brainstorm board (Plan mode: cards, outline, Start writing);
  - `26` draft timeline (snapshots, the drafts strip, Compare; re-checks live in `13`);
  - `27` research map (Map mode: themes, links, open threads);
  - `28` Defend it (the viva: questions, verdicts, voice);
  - `90` event wiring;
  - `99` start-up, which runs last.

  New modules go in `20`–`89` so their `const` values exist before start-up.
- **Data:** each document is stored as `{kind:'doc', v:2, role:'essay'|'source', title, text, review, marks, brief, use, index, argmap, plan, history, defences}`. The legacy `kind:'essay'` is still read. Everything loaded passes through `fromStored()` in `02`. The research map is one more record in the same place, id `rmap` (`{kind:'rmap', v:1, at, sig, themes, links, threads, hidden}`), loaded through `cleanRmap()` in `27`.

## Build and test
- `npm ci --ignore-scripts`, then `npm test`. That runs the unit tests (`node --test`), the build (`dist/index.html`, which syntax-checks the script) and the browser tests (`tools/test_app.py`, Playwright and Chrome at `/usr/bin/google-chrome`, against a mocked runtime in `tools/mock.js`).
- `test_app.py` exits non-zero on any failed check.
- Optional private data is gitignored: `test/fixtures/*.pdf` and `seed/test-essays.json`. Without it, those steps skip.
- After editing `REVIEW_RULES`, `RECHECK_RULES`, `ARG_RULES`, `IDEA_RULES`, `MAP_RULES`, `EXAM_RULES` or `JUDGE_RULES`, run `npm run sync-prompt-doc`; a unit test enforces the match.
- **Workflow:** feature branch → PR → CI green (`.github/workflows/ci.yml`) → merge → publish.

## Publish
- **App:** artifact slug `09021979-394b-4c68-be40-8f3af9c78303` (https://claude.ai/artifact/27X1wxt4QTTi1oxFRun3VU). Build first. Get `base_version` from `get_artifact`, then `publish_files` with `mode: "patch"` and only `[{as: "index.html", path: "<repo>/dist/index.html"}]`. `seed/test-essays.json` is already on the artifact, so don't re-send it.
- **Capabilities:** `sample`, `db`, `user`, `tts` (the viva reads questions aloud), `dictation` (answers by voice) and `downloads` (saving the writing record). Each can be `null` in a view: hide its control and keep a typed or on-screen fallback. The `db` rules lock shared paths to the owner and let each viewer at Contributor level or above write their own `data/users/{self}`. When adding a capability, declare it first, then publish the code that uses it.
- **Mockups:** design canvas slug `8314b750-d52b-4f2c-a0e2-6ec07b031db4` (https://claude.ai/artifact/HBp9wn9DgjAvdjWxKyRXfZ).
- **Plans:** see `ROADMAP.md`.

## Rules
- The repo is public. Never commit essays, PDFs, `seed/` or notes about the owner's essays.
- Model output, file text and database data are data, never markup. Build DOM with `h()` or `textContent`. `innerHTML` is only for the fixed icon strings.
- Validate the model's JSON with the `lib.js` validators (`parseReview`, `validateIndex`, `validateArgmap`, `validateIdeas`, `validateRmap`, `validateExam`, `validateJudge`): quotes must anchor in the real text, and types and values must be from known lists. For lookups keyed by untrusted strings, use `hasOwn()` and `safeId()`, never `obj[key]` truthiness.
- Document text goes into prompts only through `fence()`, inside its own block.
- Third-party scripts load only via `loadScript(LIBS.x)`, which uses subresource integrity. To bump pdf.js or mammoth, update the version, URL and `sha384` in `00-config.js`; a unit test checks them against `node_modules`.
- **AI calls:** spend the viewer's plan, so only call on a user action. Claims-index reads run one at a time and are cached by text hash.
- **Storage:** each user's documents live at `data/users/<await user.id()>/<docId>`. Write one document at a time; `persist()` debounces and chains the writes. A record must stay under 250 KB: `serial()` fits drafts (notes before text) and the argument map into whatever room the essay leaves.
- **Editor:** a transparent `<textarea id="ed">` sits over a marked-up copy (`#backdrop`). Any text style goes on `.txt` so both keep identical metrics, and the textarea never scrolls internally.
- **Visual language:**
  - contradiction, source clash and library clash: rust `--rel`, solid, plus a margin mark;
  - tension: dashed rust;
  - logic: wavy violet;
  - evidence and citation: dotted teal;
  - clarity: double blue;
  - grammar: thin slate.
  - argument roles reuse these colours (`ROLE_INFO`): thesis and conclusion rust, evidence teal, objection violet, reply blue, context slate; weak points are rust rings and a dashed rust break in the line. Drift always runs away from the text.

  - brainstorm cards: angle ink, objection violet, source teal, question blue (`IDEA_INFO`).
  - map links (`MAP_KIND`): clash rust, supports teal, critiques dashed violet, builds on and cites slate (cites dotted).
  - viva verdicts (`VERDICT_INFO`): strong green `--ok`, partial amber `--warn`, weak rust, skipped slate.

  The type is Inter for the UI and Source Serif 4 for the essay, with light and dark themes via `light-dark()`.
