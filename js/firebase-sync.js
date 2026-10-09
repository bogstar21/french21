/* ============================================================
   Cross-device sync via Firebase Auth + Firestore.

   Model
     - Local-first: every write hits localStorage immediately,
       so the app never blocks on the network.
     - One Firestore document per user: users/{uid}
     - Remote writes are debounced; remote reads arrive through a
       live snapshot listener, so a second device updates within
       seconds without a refresh.
     - Conflicts are resolved field-by-field by `mergeProgress`
       rather than last-document-wins, so studying on two devices
       never silently discards the other device's work.
   ============================================================ */

const SYNC_DEBOUNCE_MS = 1800;

/* ---------- Merge: pure, unit-testable, no Firebase here ---------- */

function mergeProgress(local, remote) {
  if (!remote) return local;
  if (!local) return remote;

  const out = JSON.parse(JSON.stringify(local));

  // --- Settings stay device-local (dark mode / voice speed are
  //     preferences for *this* screen, not account-wide state).

  const lp = local.progress || {};
  const rp = remote.progress || {};
  const op = out.progress;

  op.xp           = Math.max(lp.xp || 0, rp.xp || 0);
  op.totalMinutes = Math.max(lp.totalMinutes || 0, rp.totalMinutes || 0);
  op.currentWeek  = Math.max(lp.currentWeek || 1, rp.currentWeek || 1);
  op.currentPhase = Math.max(lp.currentPhase || 1, rp.currentPhase || 1);

  // Streak: the device that studied most recently holds the truth.
  const ls = lp.streak || {}, rs = rp.streak || {};
  const lDate = ls.lastActiveDate || "";
  const rDate = rs.lastActiveDate || "";
  op.streak = {
    ...(rDate > lDate ? rs : ls),
    longest: Math.max(ls.longest || 0, rs.longest || 0)
  };

  // Weeks: a completed session always beats an incomplete one;
  // when both are complete the higher score survives.
  op.weeks = {};
  const weekKeys = new Set([...Object.keys(lp.weeks || {}), ...Object.keys(rp.weeks || {})]);
  weekKeys.forEach((k) => {
    const lw = (lp.weeks || {})[k] || { sessions: {} };
    const rw = (rp.weeks || {})[k] || { sessions: {} };
    const sessions = {};
    const sKeys = new Set([...Object.keys(lw.sessions || {}), ...Object.keys(rw.sessions || {})]);
    sKeys.forEach((s) => {
      const a = (lw.sessions || {})[s];
      const b = (rw.sessions || {})[s];
      if (!a) { sessions[s] = b; return; }
      if (!b) { sessions[s] = a; return; }
      if (a.completed !== b.completed) { sessions[s] = a.completed ? a : b; return; }
      sessions[s] = (a.score || 0) >= (b.score || 0) ? a : b;
    });
    op.weeks[k] = {
      status: lw.status === "completed" || rw.status === "completed"
        ? "completed"
        : (lw.status || rw.status || "not_started"),
      sessions,
      quizScore: Math.max(lw.quizScore || 0, rw.quizScore || 0) || null
    };
  });

  // Phase exams: best attempt wins.
  op.phaseExams = { ...(rp.phaseExams || {}) };
  Object.entries(lp.phaseExams || {}).forEach(([k, v]) => {
    const r = op.phaseExams[k];
    op.phaseExams[k] = !r || (v.score || 0) >= (r.score || 0) ? v : r;
  });

  // Vocabulary: whichever device reviewed a word last owns its
  // spaced-repetition state — merging counts would corrupt the schedule.
  out.vocabulary = { ...(remote.vocabulary || {}) };
  Object.entries(local.vocabulary || {}).forEach(([id, lv]) => {
    const rv = out.vocabulary[id];
    if (!rv) { out.vocabulary[id] = lv; return; }
    const lt = lv.lastReviewedAt || "";
    const rt = rv.lastReviewedAt || "";
    out.vocabulary[id] = lt >= rt ? lv : rv;
  });

  // Achievements: union, earliest unlock timestamp kept.
  const achById = {};
  [...(remote.achievements || []), ...(local.achievements || [])].forEach((a) => {
    const prev = achById[a.id];
    achById[a.id] = !prev || a.unlockedAt < prev.unlockedAt ? a : prev;
  });
  out.achievements = Object.values(achById).sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt));

  // Activity log: one row per day, max minutes (never summed —
  // both devices may have logged the same study session).
  const byDate = {};
  [...(remote.activityLog || []), ...(local.activityLog || [])].forEach((e) => {
    const prev = byDate[e.date];
    byDate[e.date] = prev
      ? {
          date: e.date,
          minutes: Math.max(prev.minutes, e.minutes),
          activities: [...new Set([...(prev.activities || []), ...(e.activities || [])])]
        }
      : e;
  });
  out.activityLog = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

  return out;
}

/* ---------- Sync controller ---------- */

const Sync = {
  state: "local",          // local | signed-out | syncing | synced | error
  user: null,
  _db: null,
  _auth: null,
  _unsub: null,
  _timer: null,
  _listeners: [],
  _applyingRemote: false,
  lastError: null,

  get available() {
    return typeof FIREBASE_READY !== "undefined" && FIREBASE_READY && typeof firebase !== "undefined";
  },

  onStateChange(fn) { this._listeners.push(fn); },
  _emit() { this._listeners.forEach((fn) => fn(this.state, this.user)); },
  _set(state) { this.state = state; this._emit(); },

  init(store) {
    this.store = store;
    if (!this.available) { this._set("local"); return; }

    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      this._auth = firebase.auth();
      this._db = firebase.firestore();
      this._auth.onAuthStateChanged((user) => {
        this.user = user;
        if (user) this._attach(user.uid);
        else { this._detach(); this._set("signed-out"); }
      });
    } catch (e) {
      console.error("Firebase init failed", e);
      this.lastError = e.message;
      this._set("error");
    }
  },

  async signUp(email, password) {
    await this._auth.createUserWithEmailAndPassword(email, password);
  },
  async signIn(email, password) {
    await this._auth.signInWithEmailAndPassword(email, password);
  },
  async signOut() {
    await this._auth.signOut();
  },

  _attach(uid) {
    this._set("syncing");
    this._detach();
    const ref = this._db.collection("users").doc(uid);

    this._unsub = ref.onSnapshot(
      (snap) => {
        if (snap.metadata.hasPendingWrites) return; // our own echo
        const remote = snap.exists ? snap.data() : null;
        if (remote) {
          this._applyingRemote = true;
          const merged = mergeProgress(this.store.data, remote);
          this.store.replaceAll(merged);
          this._applyingRemote = false;
        } else {
          this.push(true); // first login on a fresh account — seed it
        }
        this._set("synced");
      },
      (err) => {
        console.error("Firestore listener error", err);
        this.lastError = err.message;
        this._set("error");
      }
    );
  },

  _detach() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
  },

  push(immediate = false) {
    if (!this.user || !this._db || this._applyingRemote) return;
    clearTimeout(this._timer);
    const run = async () => {
      try {
        this._set("syncing");
        const payload = JSON.parse(JSON.stringify(this.store.data));
        delete payload.user.settings; // device-local
        payload._updatedAt = new Date().toISOString();
        await this._db.collection("users").doc(this.user.uid).set(payload, { merge: false });
        this._set("synced");
      } catch (e) {
        console.error("Sync push failed", e);
        this.lastError = e.message;
        this._set("error");
      }
    };
    if (immediate) run();
    else this._timer = setTimeout(run, SYNC_DEBOUNCE_MS);
  },

  label() {
    switch (this.state) {
      case "synced":     return "Synced";
      case "syncing":    return "Syncing…";
      case "error":      return "Sync error";
      case "signed-out": return "Sign in to sync";
      default:           return "This device only";
    }
  }
};
