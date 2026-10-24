/* ============================================================
   Curriculum content loader.
   ============================================================ */

const CourseData = {
  sections: [],
  loaded: false,

  async load() {
    if (this.loaded) return;
    const r = await fetch("data/curriculum.json");
    const d = await r.json();
    this.sections = d.sections;
    this.loaded = true;
  },

  getSection(id) { return this.sections.find((s) => s.id === id); },

  /** Every checkable id across the whole curriculum, in display order. */
  allIds() {
    const ids = [];
    for (const s of this.sections) {
      (s.verbGroups || []).forEach((v) => ids.push(v.id));
      (s.irregularVerbs || []).forEach((v) => ids.push(v.id));
      (s.items || []).forEach((it) => ids.push(it.id));
    }
    return ids;
  },

  /** All ids belonging to one section (for its own progress bar). */
  idsForSection(section) {
    const ids = [];
    (section.verbGroups || []).forEach((v) => ids.push(v.id));
    (section.irregularVerbs || []).forEach((v) => ids.push(v.id));
    (section.items || []).forEach((it) => ids.push(it.id));
    return ids;
  },

  totalCount() { return this.allIds().length; }
};
