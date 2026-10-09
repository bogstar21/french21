# Setup

## Running it locally

```bash
node server.js
```

Then open <http://localhost:3000>. No dependencies to install — the server uses
only Node built-ins.

Without `APP_PASSWORD` the app still works; it simply stays in local-only mode and
saves progress in that browser.

To test sync locally:

```bash
APP_PASSWORD=choose-something DATA_DIR=./.data node server.js
```

---

## Deploying on Railway

The repo already contains `package.json` and `server.js`, so Railway detects a Node
service and runs `npm start` on its own. Two settings are needed.

### 1. Set the password

**Railway → your service → Variables → New Variable**

| Name | Value |
|---|---|
| `APP_PASSWORD` | whatever you want to type when signing in |

Use something long. Anyone who has it can read and change your progress — it is the
only lock on the data. Never commit it; it belongs in Railway only.

Changing it later signs out every device, which is exactly what you want if you ever
think it leaked.

### 2. Attach a volume — don't skip this

**Railway → your service → Settings → Volumes → Add Volume**

Mount path can be anything (`/data` is fine). Railway then exposes
`RAILWAY_VOLUME_MOUNT_PATH` and the server writes progress there.

**Without a volume, Railway wipes the container filesystem on every redeploy and
your progress goes with it.** The app detects this and warns you in two places: the
startup logs, and the sync chip, which reads *"Synced (no volume!)"*.

### 3. Sign in

Open your Railway URL. The chip in the top right should read **Sign in to sync** —
click it, enter the password, and it turns green. Repeat on your phone with the same
password. That is the whole flow; there is no account to create.

Sessions last 90 days per device.

---

## How progress is saved

### Within a session — after every answer

Every flashcard, exercise, drill and quiz question writes a **checkpoint** the moment
you answer it. Closing the tab, refreshing, or losing your connection costs you
nothing: reopening the session drops you on the next unanswered item, with your score
so far intact.

This covers:

| | |
|---|---|
| Flashcards | resumes on the next card, same order, same direction |
| Grammar exercises | resumes on the next question |
| Translation drills | resumes on the next sentence |
| Composition | your typed draft is restored word for word |
| Weekly quiz | resumes mid-quiz, same questions |
| Phase exams | resumes mid-paper — 40 questions are never lost |
| Multi-stage sessions | resumes in the right stage, keeping earlier stage scores |

A half-finished session shows a **Resume** badge on the week page, and every session
screen has a **Start over** control if you would rather begin again.

Checkpoints are deliberately **device-local and never synced** — a cursor position is
only meaningful on the device you left it on, and syncing it would make two devices
fight over where you are.

### Across devices — a couple of seconds after each answer

Completed work (scores, XP, streak, vocabulary scheduling) uploads on a short debounce
and downloads when you focus the tab or every 30 seconds.

Conflicts are merged **field by field**, not last-write-wins, so studying on a laptop
and a phone on the same day never discards either device's work:

| Data | Rule |
|---|---|
| XP, minutes, current week | highest value wins |
| Session results | a completed session beats an incomplete one; then higher score |
| Quiz & exam scores | best attempt wins |
| Vocabulary (spaced repetition) | the device that reviewed the word **most recently** owns its schedule |
| Streak | the record with the later `lastActiveDate` |
| Achievements | union, earliest unlock kept |
| Daily activity log | one row per day, **max** minutes — never summed, so the same session logged twice cannot inflate your total |

Dark mode and voice speed stay per-device on purpose; the server strips them from
anything it is sent.

---

## Security notes

- The password is compared on hashes with a timing-safe comparison.
- Sessions are a signed HMAC token in an `httpOnly`, `SameSite=Lax` cookie, marked
  `Secure` behind Railway's HTTPS — JavaScript on the page cannot read it.
- Login is rate-limited to 10 attempts per IP per 15 minutes.
- Static serving is restricted to the app's own directories, with path-traversal
  blocked; `server.js` and `package.json` are not reachable over HTTP.
- Progress writes go to a temp file and are renamed into place, with the previous
  copy kept as `progress.bak.json`, so an interrupted write cannot corrupt your data.

This is a single shared password protecting French flashcard progress — proportionate
to what it guards, not a system for sensitive data.

---

## Backing up or moving your progress

The whole record is one JSON file on the volume. From a Railway shell:

```bash
cat $RAILWAY_VOLUME_MOUNT_PATH/progress.json
```

Save that somewhere and you have a complete backup.

---

## File map

```
french-course/
├── server.js             zero-dependency server: static + auth + storage
├── package.json          makes Railway run it as a Node service
├── index.html
├── css/style.css         design tokens and every component
├── js/
│   ├── storage.js        local-first store, SM-2, pace tracking, checkpoints
│   ├── sync.js           login, upload/download, field-level merge
│   ├── runner.js         session cursor + per-answer checkpointing
│   ├── data.js           content loader
│   ├── app.js            router and views
│   └── …                 one module per exercise type
└── data/
    ├── weeks/week01–12.json
    ├── grammar-reference.json
    ├── translations.json
    └── resources.json
```
