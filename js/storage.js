/* ============================================================
   Progress store — local-first, sync-aware.

   localStorage holds two separate keys:
     french_course_progress  → the synced study record
     french_course_settings  → device-local preferences
   Keeping settings out of the synced blob means dark mode and
   voice speed stay per-device instead of fighting across phones.
   ============================================================ */

const STORAGE_KEY  = "french_course_progress_v2";
const SETTINGS_KEY = "french_course_settings_v2";

const COURSE_START = "2026-10-09";
const COURSE_END   = "2026-12-31";
const TOTAL_WEEKS  = 12;
const WEEKLY_TARGET_MINUTES = 240; // 4 hours

const SESSION_XP = { grammar: 25, listening: 25, writing: 25, review: 50 };

function today() { return new Date().toISOString().slice(0, 10); }
function daysBetween(a, b) {
  return Math.floor((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}

function defaultSettings() {
  return { speechRate: 0.85, darkMode: false, autoSpeak: true };
}

function defaultProgress() {
  return {
    user: { createdAt: today(), settings: defaultSettings() },
    progress: {
      currentWeek: 1,
      currentPhase: 1,
      totalMinutes: 0,
      xp: 0,
      streak: { current: 0, longest: 0, lastActiveDate: null },
      weeks: {},
      phaseExams: {}
    },
    vocabulary: {},
    achievements: [],
    activityLog: []
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
      if (raw) data = { ...data, ...JSON.parse(raw) };
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
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

  /* ---------------- Activity & streak ---------------- */

  recordActivity(minutes, activityIds) {
    const d = today();
    this.data.progress.totalMinutes += minutes;

    const log = this.data.activityLog;
    const entry = log.find((e) => e.date === d);
    if (entry) {
      entry.minutes += minutes;
      entry.activities = [...new Set([...entry.activities, ...activityIds])];
    } else {
      log.push({ date: d, minutes, activities: activityIds });
    }
    this._updateStreak(d);
    this._save();
  }

  _updateStreak(d) {
    const s = this.data.progress.streak;
    if (s.lastActiveDate === d) return;
    const gap = s.lastActiveDate ? daysBetween(s.lastActiveDate, d) : null;
    s.current = gap === 1 ? s.current + 1 : 1;
    s.longest = Math.max(s.longest, s.current);
    s.lastActiveDate = d;
    if (s.current >= 7)  this.unlockAchievement("streak_7");
    if (s.current >= 30) this.unlockAchievement("streak_30");
  }

  minutesThisWeek() {
    const now = new Date();
    const monday = new Date(now);
    const dow = (now.getDay() + 6) % 7; // Mon = 0
    monday.setDate(now.getDate() - dow);
    const from = monday.toISOString().slice(0, 10);
    return this.data.activityLog
      .filter((e) => e.date >= from)
      .reduce((sum, e) => sum + e.minutes, 0);
  }

  /* ---------------- XP & level ---------------- */

  addXP(n) { this.data.progress.xp += n; }

  getLevel() {
    const xp = this.data.progress.xp;
    const tiers = [
      { name: "Débutant",     min: 0,    next: 500 },
      { name: "Explorateur",  min: 500,  next: 1500 },
      { name: "Aventurier",   min: 1500, next: 3000 },
      { name: "Connaisseur",  min: 3000, next: 5000 },
      { name: "Francophone",  min: 5000, next: null }
    ];
    let tier = tiers[0];
    for (const t of tiers) if (xp >= t.min) tier = t;
    const span = tier.next ? tier.next - tier.min : 1;
    return { ...tier, progress: tier.next ? ((xp - tier.min) / span) * 100 : 100 };
  }

  /* ---------------- Weeks & sessions ---------------- */

  getWeekProgress(n) {
    return this.data.progress.weeks[n] || { status: "not_started", sessions: {}, quizScore: null };
  }

  weekPercent(n) {
    const w = this.getWeekProgress(n);
    const done = ["grammar", "listening", "writing", "review"]
      .filter((s) => w.sessions[s]?.completed).length;
    return (done / 4) * 100;
  }

  completedWeekCount() {
    return Object.values(this.data.progress.weeks).filter((w) => w.status === "completed").length;
  }

  completeSession(weekNum, type, score) {
    const weeks = this.data.progress.weeks;
    if (!weeks[weekNum]) weeks[weekNum] = { status: "in_progress", sessions: {}, quizScore: null };
    const w = weeks[weekNum];

    const prev = w.sessions[type];
    w.sessions[type] = {
      completed: true,
      score: prev?.completed ? Math.max(prev.score || 0, score) : score,
      completedAt: new Date().toISOString()
    };
    if (!prev?.completed) this.addXP(SESSION_XP[type] || 25);

    const allDone = ["grammar", "listening", "writing", "review"]
      .every((s) => w.sessions[s]?.completed);
    if (allDone && w.status !== "completed") {
      w.status = "completed";
      this.data.progress.currentWeek = Math.min(TOTAL_WEEKS, Math.max(this.data.progress.currentWeek, weekNum + 1));
      this.unlockAchievement("first_week");
    }
    this._save();
  }

  recordQuizScore(weekNum, score) {
    const weeks = this.data.progress.weeks;
    if (!weeks[weekNum]) weeks[weekNum] = { status: "in_progress", sessions: {}, quizScore: null };
    weeks[weekNum].quizScore = Math.max(weeks[weekNum].quizScore || 0, score);
    if (score === 100) this.unlockAchievement("perfect_quiz");
    this._save();
  }

  recordPhaseExam(phase, score) {
    const prev = this.data.progress.phaseExams[phase];
    if (!prev || score > prev.score) {
      this.data.progress.phaseExams[phase] = { score, completedAt: new Date().toISOString() };
    }
    this.addXP(100);
    if (score >= 65) {
      this.unlockAchievement("phase_" + phase);
      if (phase === 3) this.unlockAchievement("a2_level");
    }
    this._save();
  }

  isWeekUnlocked(n) {
    return n === 1 || n <= this.data.progress.currentWeek;
  }

  /* ---------------- Pace against the Dec 31 deadline ---------------- */

  pace() {
    const d = today();
    const elapsed = Math.max(0, daysBetween(COURSE_START, d));
    const totalDays = daysBetween(COURSE_START, COURSE_END);
    const daysLeft = Math.max(0, daysBetween(d, COURSE_END));

    const weeksElapsed = Math.floor(elapsed / 7);
    const expectedWeek = Math.min(TOTAL_WEEKS, weeksElapsed + 1);
    const done = this.completedWeekCount();
    const delta = done - weeksElapsed;

    let status = "ontrack", label = "On track";
    if (delta >= 1)      { status = "ahead";  label = delta === 1 ? "1 week ahead" : `${delta} weeks ahead`; }
    else if (delta <= -1) { status = "behind"; label = delta === -1 ? "1 week behind" : `${Math.abs(delta)} weeks behind`; }

    return {
      elapsed, totalDays, daysLeft,
      expectedWeek, weeksElapsed,
      completed: done,
      percentDone: (done / TOTAL_WEEKS) * 100,
      percentElapsed: Math.min(100, (elapsed / totalDays) * 100),
      status, label,
      started: elapsed >= 0 && d >= COURSE_START,
      finished: d > COURSE_END
    };
  }

  /* ---------------- Vocabulary / SM-2 ---------------- */

  getVocabEntry(id) {
    return this.data.vocabulary[id] || {
      level: "new", correctCount: 0, incorrectCount: 0,
      nextReviewAt: today(), lastReviewedAt: null
    };
  }

  reviewVocab(id, correct) {
    const e = this.getVocabEntry(id);
    if (correct) {
      e.correctCount += 1;
      const days = e.correctCount === 1 ? 1
                 : e.correctCount === 2 ? 3
                 : e.correctCount <= 4  ? 7
                 : 14;
      e.level = e.correctCount >= 5 ? "mastered" : e.correctCount >= 3 ? "known" : "learning";
      const next = new Date();
      next.setDate(next.getDate() + days);
      e.nextReviewAt = next.toISOString().slice(0, 10);
    } else {
      e.incorrectCount += 1;
      e.correctCount = 0;
      e.level = "learning";
      e.nextReviewAt = today();
    }
    e.lastReviewedAt = new Date().toISOString();
    this.data.vocabulary[id] = e;

    const mastered = this.vocabStats().mastered;
    if (mastered >= 100) this.unlockAchievement("vocab_100");
    if (mastered >= 300) this.unlockAchievement("vocab_all");
    this._save();
  }

  vocabStats() {
    const v = Object.values(this.data.vocabulary);
    return {
      total: v.length,
      learning: v.filter((x) => x.level === "learning").length,
      known:    v.filter((x) => x.level === "known").length,
      mastered: v.filter((x) => x.level === "mastered").length
    };
  }

  getDueVocab(ids) {
    const d = today();
    return ids.filter((id) => {
      const e = this.data.vocabulary[id];
      return !e || e.nextReviewAt <= d;
    });
  }

  /* ---------------- Achievements ---------------- */

  unlockAchievement(id) {
    if (this.data.achievements.some((a) => a.id === id)) return false;
    this.data.achievements.push({ id, unlockedAt: new Date().toISOString() });
    return true;
  }

  hasAchievement(id) { return this.data.achievements.some((a) => a.id === id); }

  reset() {
    const settings = this.data.user.settings;
    this.data = defaultProgress();
    this.data.user.settings = settings;
    this._save();
  }
}

const store = new ProgressStore();
