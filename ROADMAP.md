# Throughline roadmap

**The promise:** see your reasoning. Throughline marks problems where they are, draws how ideas connect, never writes for you, and runs on the AI you already pay for.

**Where it's going:** plan → write → check → improve → connect. Version 1 covers *write* and *check*. The five features below add the rest, ending with a map of everything you've written and read.

Mockups: [design canvas](https://claude.ai/artifact/HBp9wn9DgjAvdjWxKyRXfZ). Boards 1–5 show version 1, and [board 6](https://claude.ai/artifact/HBp9wn9DgjAvdjWxKyRXfZ#artboard-Map) shows feature 5, the research map. Boards 7–10 explore thinking an essay through: Grow and Unfold are built; the loom and Build-up are next (below).

## Foundations (built alongside the features)

- **Bring your own AI:** a standalone web app where people sign in with ChatGPT, Google (Gemini) or Claude. Every provider gets the same prompts through one adapter (`review(prompt) → JSON`).
- **Real documents:** headings, footnotes and citations, plus Word and PDF import and export. Later, a Google Docs and Word add-on so people can use Throughline where they already write.
- **Claims index (shipped in v0.2):** the shared data layer. Every essay and source is broken into claims, with their positions and stances, and cached, so re-checks only re-read what changed. Features 1–5 all read from it, and the cache keeps AI usage down.

## The five features

### 1. Sources: choose what counts (shipped in v0.2)
**Shipped:**
- the brief;
- sources (upload or paste) with per-essay switches;
- source clash and citation notes;
- brief coverage;
- margin chips for supported passages;
- the claims index for long documents.

**Next:**
- import from links once the page can fetch;
- matching citation styles to sources;
- page numbers for PDF passages.

- **What it does:** a Sources panel holds your assignment brief, the papers you're using and your past essays. Each one has an in/out switch for reviews and a role: my writing, a source, or an opposing view.
- **What reviews add:**
  - claims with no support in your sources;
  - citations that don't say what you claim;
  - quotes that don't match the source;
  - parts of the question the essay never answers.
- **What you see:** source chips in the margin next to the claims they support (green) or contradict (rust), a hollow marker on unsupported claims, and a coverage bar for the brief.
- **Why it wins:** grammar tools don't read your sources, and research tools (Elicit, Consensus, scite) don't check your essay against them.
- **Done when:** reviews respect the switches, and every flagged citation links to the passage in the source.

### 2. Argument flow (shipped in v0.3)
**Shipped:**
- the Argument tab: the thesis, then every paragraph on one line, labelled by its role, with arcs for paragraphs that back up or answer each other;
- drift: a paragraph that strays from the thesis pulls the line away from the text;
- weak points (dropped thread, circular step, missing step, unanswered objection) ringed on the line and listed; a missing step breaks the line;
- the same line in the essay's margin, linked both ways: hover or click a paragraph in either place;
- a map that goes out of date when you edit, and stops linking when paragraphs are added or removed;
- a ready-made map on the sample essay, so the view works before any AI call.

**Next:**
- run it on the four test essays with a real model and tune the prompt (the "done when" check below);
- draw dropped threads as loose ends and circular steps as loops;
- re-map only the paragraphs that changed.

- **What it does:** one click turns the essay into its argument. The thesis sits at the top, each paragraph's claim follows in order, and arrows show what supports, answers or leads to what.
- **What you see:** a vertical map beside the text, with the throughline running down it:
  - paragraphs that drift from the thesis bend away from the line;
  - dropped threads hang loose;
  - circular steps loop back.
  
  Hover a node to light up its paragraph.
- **Why it wins:** argument-mapping tools (Kialo, Rationale) are manual, and chatbots answer in paragraphs. This map is automatic and tied to your own words.
- **Done when:** the map matches the structure of the four test essays, and every node scrolls to its paragraph.

### 3. Brainstorm board (shipped in v0.4)
**Shipped:**
- Plan mode: a board that starts from the question (or the brief), with cards in four clusters: angles, objections, passages from your sources, and questions back to you;
- keep, bin, edit and add cards; answer Claude's questions on the card;
- drag cards into an outline, or onto a point to group them under it, with buttons for every move;
- "Start writing" adds the outline to the essay as headings, never as prose, and can be undone;
- source cards open the source at the passage, and only quotes found in the source are kept.

**Next:**
- the argument flow compares the outline with the draft ("you planned an answer to the objection; it isn't there");
- free placement on a canvas, with clusters you name yourself.

- **What it does:** start from a question or the brief. The AI asks questions back and offers angles, objections and relevant passages from your sources, as cards. You keep, merge or bin them, then drag them into an outline. "Start writing" turns the outline into headings, never into prose.
- **What you see:** a card canvas with clusters and an outline column. Later, the argument flow compares your plan with your draft, for example "you planned an answer to the objection in ¶5; it isn't there".
- **Why it wins:** chatbots write the essay for you, which is an integrity risk. Whiteboard AIs (Miro, Whimsical) aren't connected to your sources or your draft.

### 4. Draft timeline (shipped in v0.5)
**Shipped:**
- every review keeps a snapshot of the text and its notes; drafts share unchanged paragraphs, so they take little room;
- a strip of drafts in the Notes view: open notes by colour, the ones you dealt with pale, and what each review fixed (−) and found (+);
- Compare: two drafts (or the latest draft and your unreviewed changes) paragraph by paragraph, with word-level edits and the notes sorted into fixed, still open, new and dismissed;
- re-checks: after small edits, the review reads only the changed paragraphs, their neighbours and the paragraphs the last review tied to them, and the rest as first sentences; notes on untouched paragraphs carry over with your marks;
- notes you dismissed stay dismissed when a full review finds them again.

**Next:**
- a writing-process view for teachers: time between drafts and what changed, exportable as evidence of your own work;
- re-check sources only when their passages changed.

- **What it does:** every review becomes a snapshot. A strip of drafts shows which notes opened and which got fixed, by colour. Pick two drafts to compare their text and notes side by side.
- **Efficiency:** re-checks only re-read the paragraphs you changed and whatever they connect to, so they're faster and use less of your plan.
- **Why it wins:** version history shows text, not reasoning. The timeline also shows your own writing process, which is useful evidence that you did the work.

### 5. Research map (the last feature, shipped in v0.6)
**Shipped:**
- Map mode: every essay and source as a card, grouped into themes Claude names, read from each document's claims index;
- links down to the passage: clash, supports, builds on, critiques and cites, with filters and counts;
- choose a line to read the two passages side by side, with a way to resolve a clash; open both (essay in the editor, the other in the reader), brainstorm it, or hide it;
- choose a card to see its links, open it, see its argument flow, start a brainstorm, or switch it in or out of each essay's reviews;
- open threads: questions your work raises but never settles, each a one-click brainstorm;
- the map is saved beside your documents and says when the library has changed since.

**Next:**
- re-map only the documents that changed;
- drag cards to arrange the map yourself, and name or merge themes.

- **What it does:** a living map of everything you've written and read.
  - Essays and sources are nodes, and lines show how they connect: builds on, supports or clashes. Themes cluster on their own.
  - Click a line to see the two passages side by side. Click a node to switch it in or out of reviews, open it, or see its argument flow.
  - "Open threads" lists questions your work raises but never settles, and each one can start a brainstorm.
- **What you see:** [board 6](https://claude.ai/artifact/HBp9wn9DgjAvdjWxKyRXfZ#artboard-Map). It shows essays and sources grouped by theme, a selected clash between two essays, and open threads.
- **Why it wins:** Connected Papers, Litmaps and ResearchRabbit map citations between published papers, and Obsidian maps the links you draw by hand. Throughline maps claims across your own writing and your sources, automatically, down to the passage.

## Beyond the five features

From the November 2026 review of what would make Throughline stand out: Grammarly Authorship and Turnitin Clarity already prove someone *typed* an essay. Throughline should prove they *understand* it.

### 6. Defend it (shipped in v0.7)
- A viva on your own essay. The examiner (a supportive tutor or a tough one) asks 3, 5 or 8 questions aimed at the weakest points: the argument map's problems and the review's open notes.
- Questions are read aloud and answers can be spoken (the platform's text-to-speech and dictation) or typed.
- Each answer gets a verdict, feedback, at most one follow-up, and what the essay itself should change. The report scores the viva and marks spoken and pasted answers.
- Vivas are kept with the essay for the writing record.

### 7. The writing record (shipped in v0.8)
- How the essay was made, kept as it's written: active time and length day by day, and where every character came from (typed, pasted, an imported file, Claude's suggestions you accepted, outline headings).
- The drafts and what each fixed, the vivas and how each answer was given, and a plain statement of how AI was used.
- Download it as a web page or copy it as text to hand in. It says what it covers: work done in Throughline, nothing else.

### 8. Your progress (shipped in v0.9)
- Every reviewed essay, compared first draft to first draft: notes per 1,000 words for each kind of note, on small multiples with one shared scale, and the notes later drafts fixed.
- **Find my habits** sends the notes (fenced, with ids) to Claude and keeps only habits backed by at least two real notes. Each habit links to the passages that show it and gives one tip. The answer is kept in a `growth` record and says when newer reviews have made it out of date.
- Copies of the sample essay don't count.

### 9. Consistent terms (shipped in v0.11)
- Each term written one way. The Terms tab lists terms the essay writes more than one way (other hyphens, spaces, capitals, accents or apostrophes), found on the device as you type. Quotations, headings and sentence-start capitals don't count, and pairs that are right both ways ("every day", "everyday") are left out.
- **Find them** asks Claude for different words for one idea ("remote work", "working from home"). It keeps only forms the essay really uses (`validateTerms`).
- Keeping a form makes it one of your terms, kept in a `terms` record and checked in every essay: other spellings are marked and change in one undoable edit; other words are marked for the writer to rewrite, or replace one at a time.

### 10. Grow and Unfold (shipped in v0.12)
- **Grow** (Plan mode): one question at a time about the writer's own idea. The app chooses the kind of question and the answer it's about (`growNext`): an objection waiting for a reply first, then the move made least so far (another reason, what you mean, who disagrees, what follows, what backs a reason up, how answers connect), aimed at the least developed answer. Claude phrases it (`GROW_RULES`); plain questions stand in without it. Skip parks a question; "Ask it another way" asks again; choosing an answer lets the writer change it, remove it (with undo) or be asked about it. A meter shows which kinds of thinking are thin.
- **Unfold**: one line, reasons, support and the other side, paragraph plans, draft. All from the writer's answers; gaps ask questions and open Grow. "Start writing" adds headings only.

### Next: the loom and Build-up (mockups, boards 9–10)
[Boards 9–10](https://claude.ai/artifact/HBp9wn9DgjAvdjWxKyRXfZ#artboard-Loom) look at a written essay:
- **The loom:** every idea as a thread through the paragraphs: knots where ideas pull against each other, loose ends where one is dropped, and new ideas that first appear in the conclusion.
- **Build-up:** the steps a reader needs (hook, stakes, claim, reasons, the other side, reply, conclusion), which ones the essay makes, how much the reader wants to read on at each paragraph, and what to change first.

## Order
The claims index and feature 1 come first, because features 2, 3 and 5 all read from them. Feature 4 makes the core loop sticky and cheaper. Feature 5 ties everything together: it is where planning, writing and checking meet.
