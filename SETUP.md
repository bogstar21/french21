# Setup

## Running the app

The app loads its content from JSON files, which browsers block over `file://`.
Serve the folder over HTTP instead:

```bash
cd french-course && python3 -m http.server 8765
```

Then open <http://localhost:8765>.

Without any further setup the app is fully functional — progress is saved in
that browser's `localStorage`. The rest of this document is only needed to make
progress follow you between devices.

---

## Cross-device sync (Firebase)

Roughly fifteen minutes, all on the free tier. The free Spark plan allows 50,000
document reads and 20,000 writes per day; a single learner uses a few dozen.

### 1. Create the project

1. Go to <https://console.firebase.google.com> and click **Add project**.
2. Name it anything (`mon-francais` works). Google Analytics is not needed — turn it off.

### 2. Enable Firestore

1. In the left sidebar: **Build → Firestore Database → Create database**.
2. Choose **Start in production mode** (the rules below will replace the defaults).
3. Pick the region closest to you — `eur3 (europe-west)` for Europe.

### 3. Enable email sign-in

1. **Build → Authentication → Get started**.
2. Under *Sign-in method*, enable **Email/Password**. Leave "Email link" off.

### 4. Register a web app and copy the config

1. Click the gear icon → **Project settings**.
2. Scroll to *Your apps* and click the web icon **`</>`**.
3. Give it a nickname, skip Firebase Hosting, click **Register app**.
4. Copy the values out of the `firebaseConfig` object it shows you.

Paste them into `js/firebase-config.js`:

```js
const FIREBASE_CONFIG = {
  apiKey: "AIza…",
  authDomain: "mon-francais.firebaseapp.com",
  projectId: "mon-francais",
  storageBucket: "mon-francais.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123"
};
```

These values are **not secrets** — Firebase web config is public by design, and
the security rules below are what actually protect the data.

### 5. Lock down the security rules

In **Firestore Database → Rules**, replace everything with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}
```

Click **Publish**. This means a signed-in user can read and write their own
document and nothing else — no one can reach your progress, and you cannot
reach anyone else's.

### 6. Sign in

Reload the app. The chip in the top right should now read **Sign in to sync**.
Click it, create an account, and the chip turns green. Repeat the sign-in on
your other devices with the same email and password.

---

## How sync behaves

- **Local-first.** Every answer is written to `localStorage` immediately, so the
  app never waits on the network and works fully offline.
- **Debounced upload.** Remote writes are batched ~2 seconds after you stop
  interacting, rather than one write per flashcard.
- **Live download.** A Firestore snapshot listener pulls changes from other
  devices within a second or two, without a refresh.
- **Field-level merge, not last-write-wins.** If you study on a laptop and a
  phone at the same time, `mergeProgress()` in `js/firebase-sync.js` reconciles
  them per field:

  | Data | Rule |
  |---|---|
  | XP, minutes, current week | highest value wins |
  | Session results | a completed session beats an incomplete one; then higher score |
  | Quiz & exam scores | best attempt wins |
  | Vocabulary (spaced repetition) | the device that reviewed the word **most recently** owns its schedule |
  | Streak | the record with the later `lastActiveDate` |
  | Achievements | union, earliest unlock timestamp kept |
  | Daily activity log | one row per day, **max** minutes — never summed, so the same session logged twice does not inflate your total |

- **Settings stay local.** Dark mode and voice speed are per-device on purpose,
  so a dark phone does not force a dark laptop.

## Hosting it online

Any static host works, since there is no build step. Firebase Hosting is the
natural fit if you have already created the project:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting     # public directory: .   |   single-page app: No
firebase deploy
```

GitHub Pages, Netlify and Cloudflare Pages all work the same way — point them at
this folder. If you deploy to a custom domain, add it under
**Authentication → Settings → Authorized domains**, or sign-in will be rejected.

---

## File map

```
french-course/
├── index.html
├── SETUP.md
├── COURSE_SPEC.md            curriculum design & rationale
├── css/style.css             design tokens + all components
├── js/
│   ├── firebase-config.js    ← the only file you edit
│   ├── firebase-sync.js      auth, Firestore, merge logic
│   ├── storage.js            local-first store, SM-2, pace tracking
│   ├── data.js               content loader
│   ├── speech.js             French text-to-speech
│   ├── ui.js                 shared rendering + answer normalisation
│   ├── flashcard.js  exercise.js  reading.js
│   ├── writing.js    listening.js quiz.js
│   └── app.js                router and views
└── data/
    ├── weeks/week01–12.json  vocabulary, grammar, reading, writing, listening
    ├── grammar-reference.json  24 conjugation/reference cards
    ├── translations.json       60 EN→FR production drills
    └── resources.json          vetted external sources, by level
```
