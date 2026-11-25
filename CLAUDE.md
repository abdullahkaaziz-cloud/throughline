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
  - `29` writing record (where text came from, time, the record view and its download);
  - `30` your progress (notes per 1,000 words across essays, habits);
  - `31` testers (the first-visit welcome, Send feedback, the owner's inbox, the shared dialog);
  - `33` consistent terms (the Terms tab; the writer's terms, marked in every essay);
  - `34` Grow and Unfold (Plan mode's other views: one question at a time, then the answers at five levels of detail);
  - `35` the loom (a full-width view in Write mode: the essay's ideas as threads through its paragraphs);
  - `90` event wiring;
  - `99` start-up, which runs last.

  New modules go in `20`–`89` so their `const` values exist before start-up.
- **Data:** each document is stored as `{kind:'doc', v:2, role:'essay'|'source', title, text, review, marks, brief, use, index, argmap, plan, history, defences, activity, terms, grow, loom}` (`terms` holds Claude's groups of different words for one idea, re-checked against the text whenever they're shown; `grow` holds the writer's starting thought, one-line point and answers as a tree, `{root, line, nodes:[{id, p, k, q, a}], park, ask, order}`, loaded through `cleanGrow()`; `loom` holds Claude's threads, `{sig, at, threads, links, keep}`, checked against the paragraphs on load and whenever shown by `validateLoom()`). The legacy `kind:'essay'` is still read. Everything loaded passes through `fromStored()` in `02`. The research map is one more record in the same place, id `rmap` (`{kind:'rmap', v:1, at, sig, themes, links, threads, hidden}`), loaded through `cleanRmap()` in `27`. Your habits are another, id `growth` (`{kind:'growth', v:1, at, sig, habits}`), loaded through `cleanGrowth()` in `30`. Your terms are another, id `terms` (`{kind:'terms', v:1, rules:[{id, keep, forms, label}], apart}`), loaded through `cleanTermRules()` in `lib.js`; each term lives in one rule, and other spellings of a kept form are matched by key, so they need no rule. Records like these register in `SPECIAL` (`03`). Testers' feedback is one record each at `feedback/<their id>` (`{kind:'feedback', v:1, name, items}`), outside `data/users` so the owner can read it; `cleanFeedback()` in `31`.

## Build and test
- `npm ci --ignore-scripts`, then `npm test`. That runs the unit tests (`node --test`), the build (`dist/index.html`, which syntax-checks the script) and the browser tests (`tools/test_app.py`, Playwright and Chrome at `/usr/bin/google-chrome`, against a mocked runtime in `tools/mock.js`).
- `test_app.py` exits non-zero on any failed check.
- Optional private data is gitignored: `test/fixtures/*.pdf` and `seed/test-essays.json`. The tests read them from there (the build never copies `seed/` into `dist/`). Without them, those steps skip.
- After editing `REVIEW_RULES`, `RECHECK_RULES`, `ARG_RULES`, `IDEA_RULES`, `MAP_RULES`, `EXAM_RULES`, `JUDGE_RULES`, `HABIT_RULES`, `TERM_RULES`, `GROW_RULES` or `LOOM_RULES`, run `npm run sync-prompt-doc`; a unit test enforces the match.
- **Workflow:** feature branch → PR → CI green (`.github/workflows/ci.yml`) → merge → publish.

## Publish
- **App:** artifact slug `09021979-394b-4c68-be40-8f3af9c78303` (https://claude.ai/artifact/27X1wxt4QTTi1oxFRun3VU). Build first. Get `base_version` from `get_artifact`, then `publish_files` with `mode: "patch"` and only `[{as: "index.html", path: "<repo>/dist/index.html"}]`. The artifact holds that one file: never upload `seed/` or any essay to it, because anyone it's shared with can download its files.
- **Capabilities:** `sample`, `db`, `user`, `tts` (the viva reads questions aloud), `dictation` (answers by voice) and `downloads` (saving the writing record). Each can be `null` in a view: hide its control and keep a typed or on-screen fallback. The `db` rules lock shared paths to the owner, let each viewer at Contributor level or above write their own `data/users/{self}` (private even from the owner) and `feedback/{self}` (which the owner reads). A viewer who may only look gets browser storage instead (`03`). When adding a capability, declare it first, then publish the code that uses it.
- **Mockups:** design canvas slug `8314b750-d52b-4f2c-a0e2-6ec07b031db4` (https://claude.ai/artifact/HBp9wn9DgjAvdjWxKyRXfZ).
- **Plans:** see `ROADMAP.md`.

## Rules
- The repo is public. Never commit essays, PDFs, `seed/` or notes about the owner's essays.
- Model output, file text and database data are data, never markup. Build DOM with `h()` or `textContent`. `innerHTML` is only for the fixed icon strings.
- Validate the model's JSON with the `lib.js` validators (`parseReview`, `validateIndex`, `validateArgmap`, `validateIdeas`, `validateRmap`, `validateExam`, `validateJudge`, `validateHabits`, `validateTerms`, `validateGrowQ`, `validateLoom`): quotes must anchor in the real text, and types and values must be from known lists. For lookups keyed by untrusted strings, use `hasOwn()` and `safeId()`, never `obj[key]` truthiness.
- Document text goes into prompts only through `fence()`, inside its own block.
- Third-party scripts load only via `loadScript(LIBS.x)`, which uses subresource integrity. To bump pdf.js or mammoth, update the version, URL and `sha384` in `00-config.js`; a unit test checks them against `node_modules`.
- **AI calls:** spend the viewer's plan, so only call on a user action. Claims-index reads run one at a time and are cached by text hash.
- **Storage:** each user's documents live at `data/users/<await user.id()>/<docId>`. Write one document at a time; `persist()` debounces and chains the writes. A record must stay under 250 KB: `serial()` fits drafts (notes before text) and the argument map into whatever room the essay leaves.
- **Editor:** a transparent `<textarea id="ed">` sits over a marked-up copy (`#backdrop`). Any text style goes on `.txt` so both keep identical metrics, and the textarea never scrolls internally. Text the app puts into the essay goes through `appEdit(kind, text, fn)` around `replaceRange`, so the writing record credits it (a suggestion from Claude, outline headings) and never counts it as typing.
- **Visual language:**
  - contradiction, source clash and library clash: rust `--rel`, solid, plus a margin mark;
  - tension: dashed rust;
  - logic: wavy violet;
  - evidence and citation: dotted teal;
  - clarity: double blue;
  - grammar: thin slate.
  - argument roles reuse these colours (`ROLE_INFO`): thesis and conclusion rust, evidence teal, objection violet, reply blue, context slate; weak points are rust rings and a dashed rust break in the line. Drift always runs away from the text.

  - brainstorm cards: angle ink, objection violet, source teal, question blue (`IDEA_INFO`).
  - Grow's questions (`GROW_INFO`): why teal, what you mean blue, who disagrees violet, your reply blue, what follows ink, how it connects slate. Open and parked questions are dashed; gaps in Unfold are dashed in the colour of the question they ask.
  - the loom: the thesis is ink, the other threads take the chart slots in the order `--s1`, `--s3`, `--s4`, `--s5`, `--s2` (orange last, as it sits nearest rust). Woven in is solid, runs underneath is dotted, a knot is a rust ring, and a loose end is dashed rust with a label. A thread shown in the essay gets a background in its colour.
  - map links (`MAP_KIND`): clash rust, supports teal, critiques dashed violet, builds on and cites slate (cites dotted).
  - viva verdicts (`VERDICT_INFO`): strong green `--ok`, partial amber `--warn`, weak rust, skipped slate.
  - terms: a place where one of the writer's terms is written another way gets a light blue background (`--clar`, a background so it never hides an underline), and the place in view a blue outline. Groups found on the device or by Claude are only listed in the Terms tab until the writer keeps a form.
  - charts (the writing record, progress): the validated slots `--s1`…`--s5` in that fixed order, `--s0` gray for "other"; a single series is `--s1`, unless the series is one kind of note (progress panels, habit cards), which wears that note's colour. One axis per chart, and small multiples share one scale: two measures get two charts on a shared time axis.

  The type is Inter for the UI and Source Serif 4 for the essay, with light and dark themes via `light-dark()`.
