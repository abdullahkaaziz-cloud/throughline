# Throughline roadmap

**The promise:** see your reasoning. Throughline marks problems where they are, draws how ideas connect, never writes for you, and runs on the AI you already pay for.

**Where it's going:** plan → write → check → improve → connect. Version 1 covers *write* and *check*. The five features below add the rest, ending with a map of everything you've written and read.

Mockups: [design canvas](https://claude.ai/artifact/HBp9wn9DgjAvdjWxKyRXfZ). Boards 1–5 show version 1, and [board 6](https://claude.ai/artifact/HBp9wn9DgjAvdjWxKyRXfZ#artboard-Map) shows feature 5, the research map.

## Foundations (built alongside the features)

- **Bring your own AI:** a standalone web app where people sign in with ChatGPT, Google (Gemini) or Claude. Every provider gets the same prompts through one adapter (`review(prompt) → JSON`).
- **Real documents:** headings, footnotes and citations, plus Word and PDF import and export. Later, a Google Docs and Word add-on so people can use Throughline where they already write.
- **Claims index:** the shared data layer. Every essay and source is broken into claims, with their positions and stances, and cached, so re-checks only re-read what changed. Features 1–5 all read from it, and the cache keeps AI usage down.

## The five features

### 1. Sources: choose what counts
- **What it does:** a Sources panel holds your assignment brief, the papers you're using and your past essays. Each one has an in/out switch for reviews and a role: my writing, a source, or an opposing view.
- **What reviews add:**
  - claims with no support in your sources;
  - citations that don't say what you claim;
  - quotes that don't match the source;
  - parts of the question the essay never answers.
- **What you see:** source chips in the margin next to the claims they support (green) or contradict (rust), a hollow marker on unsupported claims, and a coverage bar for the brief.
- **Why it wins:** grammar tools don't read your sources, and research tools (Elicit, Consensus, scite) don't check your essay against them.
- **Done when:** reviews respect the switches, and every flagged citation links to the passage in the source.

### 2. Argument flow
- **What it does:** one click turns the essay into its argument. The thesis sits at the top, each paragraph's claim follows in order, and arrows show what supports, answers or leads to what.
- **What you see:** a vertical map beside the text, with the throughline running down it:
  - paragraphs that drift from the thesis bend away from the line;
  - dropped threads hang loose;
  - circular steps loop back.
  
  Hover a node to light up its paragraph.
- **Why it wins:** argument-mapping tools (Kialo, Rationale) are manual, and chatbots answer in paragraphs. This map is automatic and tied to your own words.
- **Done when:** the map matches the structure of the four test essays, and every node scrolls to its paragraph.

### 3. Brainstorm board
- **What it does:** start from a question or the brief. The AI asks questions back and offers angles, objections and relevant passages from your sources, as cards. You keep, merge or bin them, then drag them into an outline. "Start writing" turns the outline into headings, never into prose.
- **What you see:** a card canvas with clusters and an outline column. Later, the argument flow compares your plan with your draft, for example "you planned an answer to the objection in ¶5; it isn't there".
- **Why it wins:** chatbots write the essay for you, which is an integrity risk. Whiteboard AIs (Miro, Whimsical) aren't connected to your sources or your draft.

### 4. Draft timeline
- **What it does:** every review becomes a snapshot. A strip of drafts shows which notes opened and which got fixed, by colour. Pick two drafts to compare their text and notes side by side.
- **Efficiency:** re-checks only re-read the paragraphs you changed and whatever they connect to, so they're faster and use less of your plan.
- **Why it wins:** version history shows text, not reasoning. The timeline also shows your own writing process, which is useful evidence that you did the work.

### 5. Research map (the last feature)
- **What it does:** a living map of everything you've written and read.
  - Essays and sources are nodes, and lines show how they connect: builds on, supports or clashes. Themes cluster on their own.
  - Click a line to see the two passages side by side. Click a node to switch it in or out of reviews, open it, or see its argument flow.
  - "Open threads" lists questions your work raises but never settles, and each one can start a brainstorm.
- **What you see:** [board 6](https://claude.ai/artifact/HBp9wn9DgjAvdjWxKyRXfZ#artboard-Map). It shows your four essays in three themes, the selected clash between JT Universalism and the Ibn Taymiyyah essay, and three open threads.
- **Why it wins:** Connected Papers, Litmaps and ResearchRabbit map citations between published papers, and Obsidian maps the links you draw by hand. Throughline maps claims across your own writing and your sources, automatically, down to the passage.

## Order
The claims index and feature 1 come first, because features 2, 3 and 5 all read from them. Feature 4 makes the core loop sticky and cheaper. Feature 5 ties everything together: it is where planning, writing and checking meet.
