/* ============================================================
   Cross-device sync against this app's own server.

   Model
     - Local-first: every write hits localStorage immediately, so
       the app never blocks on the network and works offline.
     - One password, one shared progress file on the server.
     - Uploads are debounced; downloads happen on load, on tab
       focus, and on a slow poll.
     - Conflicts are merged field by field by `mergeProgress`
       rather than last-write-wins, so studying on a laptop and a
       phone on the same day never discards either one's work.

   If /api/status is unreachable — opened from disk, or from a
   static host like GitHub Pages — the app silently stays in
   local-only mode instead of erroring.
   ============================================================ */

const SYNC_DEBOUNCE_MS = 1500;
const POLL_MS = 30000;

/* ---------- Merge: pure, no network, unit-testable ---------- */

function mergeProgress(local, remote) {
  if (!remote) return local;
  if (!local) return remote;

  const out = JSON.parse(JSON.stringify(local));

  // Settings stay device-local: dark mode and voice speed are
  // preferences for *this* screen, not account-wide state.

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

  // Weeks: a completed session beats an incomplete one; when both
  // are complete the higher score survives.
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
  // spaced-repetition state — averaging counts would corrupt the schedule.
  out.vocabulary = { ...(remote.vocabulary || {}) };
  Object.entries(local.vocabulary || {}).forEach(([id, lv]) => {
    const rv = out.vocabulary[id];
    if (!rv) { out.vocabulary[id] = lv; return; }
    out.vocabulary[id] = (lv.lastReviewedAt || "") >= (rv.lastReviewedAt || "") ? lv : rv;
  });

  // Achievements: union, earliest unlock kept.
  const byId = {};
  [...(remote.achievements || []), ...(local.achievements || [])].forEach((a) => {
    const prev = byId[a.id];
    byId[a.id] = !prev || a.unlockedAt < prev.unlockedAt ? a : prev;
  });
  out.achievements = Object.values(byId).sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt));

  // Activity log: one row per day, max minutes — never summed, since both
  // devices may have logged the same study session.
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
  state: "local",        // local | signed-out | syncing | synced | error
  available: false,      // server reachable and APP_PASSWORD configured
  persistent: true,      // server has a volume attached
  lastError: null,
  _timer: null,
  _poll: null,
  _applying: false,
  _listeners: [],

  onStateChange(fn) { this._listeners.push(fn); },
  _emit() { this._listeners.forEach((fn) => fn(this.state)); },
  _set(s) { this.state = s; this._emit(); },

  async init(store) {
    this.store = store;
    try {
      const r = await fetch("/api/status", { credentials: "same-origin" });
      if (!r.ok) throw new Error("status " + r.status);
      const s = await r.json();
      this.available = s.syncEnabled;
      this.persistent = s.persistent;
      if (!s.syncEnabled) { this._set("local"); return; }
      if (s.authenticated) { await this.pull(); this._startPolling(); }
      else this._set("signed-out");
    } catch {
      // No server behind this page — static hosting or a file:// open.
      this.available = false;
      this._set("local");
    }
  },

  async signIn(password) {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ password })
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || "Sign-in failed.");
    await this.pull();
    this._startPolling();
  },

  async signOut() {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    this._stopPolling();
    this._set("signed-out");
  },

  /** Fetch the server copy and merge it into local state. */
  async pull() {
    if (!this.available) return;
    try {
      this._set("syncing");
      const r = await fetch("/api/progress", { credentials: "same-origin" });
      if (r.status === 401) { this._stopPolling(); this._set("signed-out"); return; }
      if (!r.ok) throw new Error("status " + r.status);

      const { data, persistent } = await r.json();
      this.persistent = persistent;

      if (data) {
        this._applying = true;
        this.store.replaceAll(mergeProgress(this.store.data, data));
        this._applying = false;
        // The merge may have advanced local state past the server's copy.
        this.push(true);
      } else {
        this.push(true); // first device — seed the file
      }
      this._set("synced");
    } catch (e) {
      this.lastError = e.message;
      this._set("error");
    }
  },

  /** Upload local state, debounced. */
  push(immediate = false) {
    if (!this.available || this._applying) return;
    if (this.state === "signed-out") return;
    clearTimeout(this._timer);

    const run = async () => {
      try {
        this._set("syncing");
        const payload = JSON.parse(JSON.stringify(this.store.data));
        delete payload.user.settings; // device-local
        const r = await fetch("/api/progress", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload)
        });
        if (r.status === 401) { this._stopPolling(); this._set("signed-out"); return; }
        if (!r.ok) throw new Error("status " + r.status);
        this._set("synced");
      } catch (e) {
        this.lastError = e.message;
        this._set("error");
      }
    };

    if (immediate) run();
    else this._timer = setTimeout(run, SYNC_DEBOUNCE_MS);
  },

  _startPolling() {
    this._stopPolling();
    // Pull on a slow timer and whenever the tab regains focus, which is
    // when you have most likely just put the other device down.
    this._poll = setInterval(() => {
      if (document.visibilityState === "visible") this.pull();
    }, POLL_MS);
    this._onFocus = () => { if (document.visibilityState === "visible") this.pull(); };
    document.addEventListener("visibilitychange", this._onFocus);
  },

  _stopPolling() {
    clearInterval(this._poll);
    this._poll = null;
    if (this._onFocus) document.removeEventListener("visibilitychange", this._onFocus);
  },

  label() {
    if (!this.available) return "This device only";
    switch (this.state) {
      case "synced":     return this.persistent ? "Synced" : "Synced (no volume!)";
      case "syncing":    return "Syncing…";
      case "error":      return "Sync error";
      case "signed-out": return "Sign in to sync";
      default:           return "This device only";
    }
  }
};
