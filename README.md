# Throughline

An essay editor that shows your reasoning. Press **Review** and the AI reads the whole essay, then marks problems where they are:
- contradictions, joined by a line in the margin;
- logic gaps;
- claims that need evidence;
- unclear sentences;
- grammar.

It suggests; you decide what changes. It never rewrites your essay.

- **Ask about any passage:** select text and ask "What's wrong?", "Make it stronger", "Does it follow?" or your own question.
- **Library check:** every essay you add is checked against your others for clashes, and the clashing passage opens in place.
- **Fix in one click:** small fixes come with suggested wording you can apply and undo. Notes you've dealt with move out of the way.
- **Upload:** Word, PDF or text files, several at once.
- **Your own AI plan:** this version runs inside Claude as a claude.ai artifact and uses the viewer's own Claude plan. ChatGPT and Gemini sign-in are next (see [ROADMAP.md](ROADMAP.md)).

## Develop

```sh
npm install                 # pdf.js and mammoth, used by the tests
node tools/build.mjs        # builds dist/index.html
python3 tools/test_app.py   # runs the headless browser tests (Playwright + Chrome)
```

`dist/index.html` is one self-contained page. Opened outside Claude it has no AI, but the sample review still works.

## Structure
- `src/index.html`, `src/styles.css`: the page shell and styles.
- `src/lib.js`: text helpers (PDF reflow, quote anchoring, word diff).
- `src/app/`: the app, in numbered files.
- `docs/review-prompt.md`: the review instructions every AI provider gets.
