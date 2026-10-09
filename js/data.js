/* ============================================================
   Course content loader.
   ============================================================ */

const WEEK_FILES = Array.from({ length: 12 }, (_, i) =>
  `data/weeks/week${String(i + 1).padStart(2, "0")}.json`
);

const CourseData = {
  weeks: [],
  resources: null,
  grammarRef: null,
  translations: null,
  loaded: false,

  async load() {
    if (this.loaded) return;
    const [weeks, resources, grammarRef, translations] = await Promise.all([
      Promise.all(WEEK_FILES.map((u) => fetch(u).then((r) => r.json()))),
      fetch("data/resources.json").then((r) => r.json()),
      fetch("data/grammar-reference.json").then((r) => r.json()),
      fetch("data/translations.json").then((r) => r.json())
    ]);
    this.weeks = weeks;
    this.resources = resources;
    this.grammarRef = grammarRef;
    this.translations = translations;
    this.loaded = true;
  },

  getWeek(n) { return this.weeks.find((w) => w.week === n); },
  getPhaseWeeks(p) { return this.weeks.filter((w) => w.phase === p); },

  allVocab() { return this.weeks.flatMap((w) => w.vocab); },
  vocabById(id) { return this.allVocab().find((v) => v.id === id); },
  weekVocabIds(n) { return (this.getWeek(n)?.vocab || []).map((v) => v.id); },

  /** Vocabulary from this week plus a sample of earlier weeks, so review compounds. */
  reviewPool(n) {
    const current = this.weekVocabIds(n);
    const earlier = this.weeks.filter((w) => w.week < n).flatMap((w) => w.vocab.map((v) => v.id));
    const due = store.getDueVocab(earlier).slice(0, 10);
    return [...current, ...due];
  },

  resourcesFor(n) {
    const spec = this.resources?.weeks?.[String(n)];
    if (!spec) return { primary: null, extra: [], focus: "" };
    const lib = this.resources.library;
    return {
      primary: lib[spec.primary] ? { key: spec.primary, ...lib[spec.primary] } : null,
      extra: (spec.extra || []).map((k) => (lib[k] ? { key: k, ...lib[k] } : null)).filter(Boolean),
      focus: spec.focus || ""
    };
  },

  grammarForWeek(n) {
    return (this.grammarRef?.entries || []).filter((e) => e.week === n);
  },
  grammarUpTo(n) {
    return (this.grammarRef?.entries || []).filter((e) => e.week <= n);
  },

  translationsFor(n) {
    return this.translations?.weeks?.[String(n)] || [];
  },

  phaseExamPool(p) {
    const weeks = this.getPhaseWeeks(p);
    return {
      grammar: weeks.flatMap((w) => w.grammar),
      reading: weeks.map((w) => w.reading),
      vocab: weeks.flatMap((w) => w.vocab),
      translations: weeks.flatMap((w) => this.translationsFor(w.week))
    };
  }
};

const PHASES = {
  1: { name: "Foundations",       weeks: "1–4",  blurb: "Sound system, core verbs, survival vocabulary" },
  2: { name: "Expansion",         weeks: "5–8",  blurb: "The past tense, questions, professional register" },
  3: { name: "A2 Consolidation",  weeks: "9–12", blurb: "All four tenses, opinions, real-world listening" }
};

const SESSIONS = {
  grammar:   { icon: "◆", day: "Mon", name: "Grammar & Vocabulary", desc: "Flashcards, conjugation drills, grammar reference" },
  listening: { icon: "◈", day: "Wed", name: "Listening & Reading",  desc: "Video or podcast, then a reading passage" },
  writing:   { icon: "◉", day: "Fri", name: "Writing & Translation", desc: "Translation drills, then guided composition" },
  review:    { icon: "◇", day: "Sun", name: "Review & Quiz",         desc: "Spaced repetition and the weekly quiz" }
};

const ACHIEVEMENTS = {
  first_week:   { icon: "🥇", name: "Premier pas",            hint: "Finish your first full week" },
  perfect_quiz: { icon: "💯", name: "Sans faute",             hint: "Score 100% on a weekly quiz" },
  streak_7:     { icon: "🔥", name: "Sept jours",             hint: "Study 7 days in a row" },
  streak_30:    { icon: "⚡", name: "Trente jours",           hint: "Study 30 days in a row" },
  vocab_100:    { icon: "📚", name: "Cent mots",              hint: "Master 100 words" },
  vocab_all:    { icon: "🎓", name: "Maître du vocabulaire",  hint: "Master all 300 words" },
  phase_1:      { icon: "①",  name: "Phase 1 réussie",        hint: "Pass the Phase 1 exam" },
  phase_2:      { icon: "②",  name: "Phase 2 réussie",        hint: "Pass the Phase 2 exam" },
  phase_3:      { icon: "③",  name: "Phase 3 réussie",        hint: "Pass the Phase 3 exam" },
  a2_level:     { icon: "🏆", name: "Niveau A2",              hint: "Pass the final exam" }
};
