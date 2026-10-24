/* ============================================================
   Cross-device sync against this app's own server.

   Model
     - Local-first: every checkbox click hits localStorage
       immediately, so the app never blocks on the network.
     - One password, one shared progress file on the server.
     - Uploads are debounced; downloads happen on load, on tab
       focus, and on a slow poll.
     - Merge is per-lesson, by timestamp: whichever device checked
       or unchecked a lesson *more recently* wins for that lesson.
       Two devices ticking different boxes the same day never lose
       either one's work — this is simpler than the old multi-field
       merge because a checkbox has exactly one piece of state.

   If /api/status is unreachable — opened from disk, or from a
   static host — the app silently stays in local-only mode.
   ============================================================ */

const SYNC_DEBOUNCE_MS = 1200;
const POLL_MS = 30000;

/* ---------- Merge: pure, no network, unit-testable ---------- */

function mergeProgress(local, remote) {
  if (!remote) return local;
  if (!local) return remote;

  const out = { user: local.user, progress: { checked: {} } };
  const lc = (local.progress && local.progress.checked) || {};
  const rc = (remote.progress && remote.progress.checked) || {};

  const ids = new Set([...Object.keys(lc), ...Object.keys(rc)]);
  ids.forEach((id) => {
    const a = lc[id], b = rc[id];
    if (!a) { out.progress.checked[id] = b; return; }
    if (!b) { out.progress.checked[id] = a; return; }
    out.progress.checked[id] = (a.at || "") >= (b.at || "") ? a : b;
  });

  return out;
}

/* ---------- Sync controller ---------- */

const Sync = {
  state: "local",        // local | signed-out | syncing | synced | error
  available: false,
  persistent: true,
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

  push(immediate = false) {
    if (!this.available || this._applying) return;
    if (this.state === "signed-out") return;
    clearTimeout(this._timer);

    const run = async () => {
      try {
        this._set("syncing");
        const payload = { progress: this.store.data.progress, user: {} };
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
