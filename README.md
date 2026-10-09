# Mon Français

A self-paced French course that runs from zero to **A2 in twelve weeks**, at four hours
a week. Vocabulary and reading are built around IT, software support and economics
rather than the usual café-and-croissant material.

No framework, no build step — plain HTML, CSS and JavaScript.

## Run it

The app fetches its content as JSON, so it needs to be served over HTTP; opening
`index.html` directly from disk will not work.

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765>.

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

## Cross-device sync

Progress is saved locally by default, which works offline and needs no setup.

To carry it between devices, add a free Firebase project — **[SETUP.md](SETUP.md)** has
the steps, the security rules and the hosting notes.

Sync is local-first: writes hit `localStorage` immediately and upload on a debounce,
while a snapshot listener pulls in changes from other devices. Conflicts are resolved
field by field rather than last-write-wins, so studying on a laptop and a phone on the
same day never discards either device's work.

## Layout

```
index.html
css/style.css          design tokens and every component
js/
  firebase-config.js   the only file you need to edit
  firebase-sync.js     auth, Firestore, merge logic
  storage.js           local-first store, SM-2, pace tracking
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
