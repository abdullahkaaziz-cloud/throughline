# Throughline

An essay editor that shows your reasoning. Press **Review** and the AI reads the whole essay, then marks problems where they are:
- contradictions, joined by a line in the margin;
- logic gaps;
- claims that need evidence;
- unclear sentences;
- grammar.

It suggests; you decide what changes. It never rewrites your essay.

- **Argument flow:** the Argument tab draws the essay as one line through its paragraphs.
  - Each paragraph is labelled by what it does for the thesis: claim, evidence, objection, reply and so on.
  - Arcs join paragraphs that back up or answer each other.
  - The line drifts left where a paragraph strays from the thesis and breaks where a step is missing. Dropped threads and unanswered objections are listed.
  - The same line runs in the margin beside the text. Hover either one to light up the paragraph.
- **Brainstorm board:** press **Plan** to think before you write.
  - Start from the question or your brief. Claude asks questions back and offers angles, objections and passages from your sources as cards.
  - Keep, edit or bin cards, add your own, and drag them into an outline. Drop a card onto a point to group it under that point.
  - **Start writing** adds the outline to the essay as headings, never as prose.
- **Ask about any passage:** select text and ask "What's wrong?", "Make it stronger", "Does it follow?" or your own question.
- **Sources and brief:** add the papers you're using and your assignment brief. For each essay, switch sources on or off.
  - Reviews flag claims a source contradicts and citations a source doesn't back up.
  - Reviews show how much of the brief the essay covers.
  - Passages a source supports get a margin chip that opens the source at the passage.
- **Library check:** every essay you add is checked against your others for clashes, and the clashing passage opens in place.
- **Fix in one click:** small fixes come with suggested wording you can apply and undo. Notes you've dealt with move out of the way.
- **Upload:** Word, PDF or text files, several at once.
- **Your own AI plan:** this version runs inside Claude as a claude.ai artifact and uses the viewer's own Claude plan. ChatGPT and Gemini sign-in are next (see [ROADMAP.md](ROADMAP.md)).

## Develop

```sh
npm ci --ignore-scripts                     # pdf.js and mammoth, used by the tests
pip install -r requirements-dev.txt        # Playwright, for the browser tests
npm test                                    # unit tests, build (dist/index.html), browser tests
```

Every pull request runs the same checks in CI. See [SECURITY.md](SECURITY.md) for how essays, AI output and third-party code are handled.

`dist/index.html` is one self-contained page. Opened outside Claude it has no AI, but the sample review still works.

## Structure
- `src/index.html`, `src/styles.css`: the page shell and styles.
- `src/lib.js`: pure helpers (PDF reflow, quote anchoring, word diff, checks on the AI's answers), with unit tests in `tests/`.
- `src/app/`: the app, in numbered files.
- `docs/review-prompt.md`, `docs/argument-prompt.md`, `docs/brainstorm-prompt.md`: the instructions every AI provider gets.
