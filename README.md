# Mon Français

A self-paced French course that runs from zero to **A2 in twelve weeks**, at four hours
a week. Vocabulary and reading are built around IT, software support and economics
rather than the usual café-and-croissant material.

No framework, no build step — plain HTML, CSS and JavaScript.

## Run it

```bash
node server.js
```

Then open <http://localhost:3000>. No dependencies to install — the server uses only
Node built-ins.

## What's in it

| | |
|---|---|
| 12 weeks | 3 phases — Foundations, Expansion, A2 Consolidation |
| 300 words | with example sentences and French text-to-speech |
| 120 grammar exercises | fill-in-the-blank, multiple choice, sentence reordering |
| 60 translation drills | English → French, accent- and case-forgiving |
| 12 reading passages | tap any word for an inline translation |
| 24 reference cards | conjugation tables and the mistakes to avoid |
| 3 phase exams | 40 questions each, answers withheld until the end |

Progress is tracked with SM-2 spaced repetition, a daily streak, XP levels and pace
tracking against the course end date.

## Never lose your place

Every answer writes a checkpoint. Refresh the page, close the tab, or drop off the
network mid-session and you come back to the next unanswered item — including your
half-written composition, and including a 40-question exam. Unfinished sessions show a
**Resume** badge, and **Start over** is always one click away.

## Cross-device sync

Set one password and your progress follows you. Progress uploads a second or two after
each answer and pulls in changes when you focus the tab.

Conflicts are merged field by field rather than last-write-wins, so studying on a
laptop and a phone on the same day never discards either device's work.

**[SETUP.md](SETUP.md)** has the Railway steps — one variable and one volume.

## Layout

```
server.js              zero-dependency server: static + auth + storage
index.html
css/style.css          design tokens and every component
js/
  storage.js           local-first store, SM-2, pace tracking, checkpoints
  sync.js              login, upload/download, field-level merge
  runner.js            session cursor + per-answer checkpointing
  data.js              content loader
  app.js               router and views
  …                    one module per exercise type
data/
  weeks/week01–12.json vocabulary, grammar, reading, writing, listening
  grammar-reference.json
  translations.json
  resources.json       external sources, tagged by CEFR level
```

Course content lives entirely in `data/`. Quizzes and exams are assembled from that same
content at runtime, so the material and the assessment cannot drift apart.
