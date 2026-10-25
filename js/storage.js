/* ============================================================
   Progress store — local-first, sync-aware.

   The data model is deliberately tiny: a map of lessonId → whether
   it's checked, each stamped with when it last changed. That
   timestamp is what makes cross-device merging safe — see sync.js.

   localStorage holds two separate keys:
     french_progress_v1   → the synced checklist state
     french_settings_v1   → device-local preferences (dark mode)
   ============================================================ */

const STORAGE_KEY  = "french_progress_v1";
const SETTINGS_KEY = "french_settings_v1";

function defaultSettings() {
  return { darkMode: false, planStart: new Date().toISOString().slice(0, 10), planWeeks: 8 };
}

function defaultProgress() {
  return {
    user: { settings: defaultSettings() },
    progress: { checked: {} }
  };
}

class ProgressStore {
  constructor() {
    this.data = this._load();
    this._listeners = [];
  }

  _load() {
    let data = defaultProgress();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        data.progress = { checked: {}, ...(parsed.progress || {}) };
      }
    } catch (e) {
      console.warn("Could not read saved progress; starting fresh.", e);
    }
    try {
      const s = localStorage.getItem(SETTINGS_KEY);
      data.user.settings = s ? { ...defaultSettings(), ...JSON.parse(s) } : defaultSettings();
    } catch {
      data.user.settings = defaultSettings();
    }
    return data;
  }

  _save({ sync = true } = {}) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ progress: this.data.progress }));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.data.user.settings));
    } catch (e) {
      console.warn("Could not persist progress", e);
    }
    if (sync && typeof Sync !== "undefined") Sync.push();
    this._notify();
  }

  /** Applied when a merge arrives from another device. */
  replaceAll(merged) {
    const settings = this.data.user.settings;
    this.data = merged;
    this.data.user = this.data.user || {};
    this.data.user.settings = settings;
    this._save({ sync: false });
  }

  onChange(fn) { this._listeners.push(fn); }
  _notify() { this._listeners.forEach((fn) => fn(this.data)); }

  /* ---------------- Settings ---------------- */

  get settings() { return this.data.user.settings; }
  setSetting(key, value) {
    this.data.user.settings[key] = value;
    this._save({ sync: false });
  }

  /* ---------------- Checklist ---------------- */

  isChecked(id) {
    const e = this.data.progress.checked[id];
    return !!(e && e.on);
  }

  setChecked(id, on) {
    this.data.progress.checked[id] = { on, at: new Date().toISOString() };
    this._save();
  }

  toggle(id) {
    const on = !this.isChecked(id);
    this.setChecked(id, on);
    return on;
  }

  /** Set many ids at once, with a single save/sync at the end. */
  setManyChecked(ids, on) {
    const at = new Date().toISOString();
    ids.forEach((id) => { this.data.progress.checked[id] = { on, at }; });
    this._save();
  }

  /** Count of checked items among a given list of ids. */
  countChecked(ids) {
    return ids.filter((id) => this.isChecked(id)).length;
  }

  reset() {
    const settings = this.data.user.settings;
    this.data = defaultProgress();
    this.data.user.settings = settings;
    this._save();
  }
}

const store = new ProgressStore();
