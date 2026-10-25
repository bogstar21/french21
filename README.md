# Mon Français

A single-page checklist for **The Perfect French with Dylane** self-study guide (A1
→ B2): all 238 lessons from the PDF — pronunciation, grammar & conjugation,
vocabulary, expressions, complex conjugation, short stories and speaking practices —
each linked straight to its video, each with a checkbox.

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
| 55 | pronunciation lessons |
| 93 | grammar & conjugation lessons (91 numbered + 2 cumulative reviews) |
| 24 | vocabulary lessons |
| 26 | expression & idiom lessons |
| 2 | complex-conjugation deep dives (passé composé vs imparfait, the subjunctive) |
| 7 | short stories, plus the 3 story books and the YouTube playlist |
| 18 | speaking practices, plus the playlist |
| 238 | lessons total, each with its own checkbox |

Every link was pulled directly out of the source PDF's own hyperlinks — not
retyped — so the 238 links on this page match the ones in your copy of the guide
exactly.

## Îlots — the Language Islands method

A second page built on Boris Shekhtman's *language islands* idea (from
*How to Improve Your Foreign Language Immediately*): short passages about your
own life, memorised cold, so you can produce them instantly instead of
assembling sentences under pressure.

Eight islands, written around the things that actually come up when you meet
someone: who you are, your job at Odoo, your family across three countries,
marathon training, travel and languages — plus the universal ones (surviving a
conversation, small talk, ordering in a café).

Each island has a passage to memorise and the supporting phrases that let you
answer follow-ups. Tick a line only when you can say it *without reading it*.
Island progress is tracked separately from the lesson checklist.

## One password, every device

Set a password once (see **[SETUP.md](SETUP.md)**) and your checked lessons follow
you everywhere. Checking a box saves instantly to this browser and uploads within a
couple of seconds; opening the page on another device and signing in pulls it all
back.

Merging is per lesson, by timestamp, so ticking different boxes on your phone and
your laptop the same day never loses either one.

## Layout

```
server.js              zero-dependency server: static + auth + storage
index.html
css/style.css           design tokens and every component
js/
  storage.js            local-first checklist store
  sync.js                login, upload/download, per-lesson merge
  data.js                 curriculum loader
  app.js                   renders the page, search, modals
  ui.js                     toast + escaping helper
data/
  curriculum.json        all 238 lessons
```

Source: [The Perfect French with Dylane](https://theperfectfrench.com).
