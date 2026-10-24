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

The whole app is one checklist: 238 lessons, each with a checkbox. Clicking one
writes `{ on: true/false, at: <timestamp> }` to `localStorage` immediately, then
uploads to the server on a short debounce.

Pulling in another device's changes (on load, on tab focus, and every 30 seconds)
merges **per lesson, by timestamp**: whichever device checked or unchecked a given
lesson *more recently* wins for that lesson. Two people — or two devices — ticking
different boxes the same day never lose either one's work, because each lesson's
state is independent of every other lesson's.

Dark mode is the only other piece of state, and it stays per-device on purpose; the
server strips it from anything it's sent.

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

This is a single shared password protecting a lesson checklist — proportionate to
what it guards, not a system for sensitive data.

---

## Backing up or moving your progress

The whole record is one small JSON file on the volume. From a Railway shell:

```bash
cat $RAILWAY_VOLUME_MOUNT_PATH/progress.json
```

Save that somewhere and you have a complete backup.

---

## Updating the curriculum

All content lives in `data/curriculum.json` — one array of sections, each with
`items` (and, for the grammar section, `verbGroups` and `irregularVerbs` too). Every
item needs a stable `id`: changing an id orphans whatever check-state is stored
against the old one, so add new lessons with new ids rather than renumbering
existing ones.

```json
{ "id": "pron-1", "num": 1, "title": "The alphabet", "video": "https://youtu.be/…" }
```

A `video` of `null` renders a disabled, non-clickable ▶ — used for the one lesson in
the source guide (French Filler Words) that has no published video yet.

---

## File map

```
french-course/
├── server.js             zero-dependency server: static + auth + storage
├── package.json          makes Railway run it as a Node service
├── index.html
├── css/style.css         design tokens and every component
├── js/
│   ├── storage.js        local-first checklist store (checked-id → {on, at})
│   ├── sync.js           login, upload/download, per-lesson timestamp merge
│   ├── data.js           curriculum loader
│   ├── app.js            renders the single-page checklist, search, modals
│   └── ui.js             toast + HTML-escaping helper
└── data/
    └── curriculum.json   all 238 lessons, extracted from the source PDF
```
