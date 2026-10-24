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

  /** Every checkable item (full object, not just id) in display order. */
  allItems() {
    const out = [];
    for (const s of this.sections) {
      (s.verbGroups || []).forEach((v) => out.push(v));
      (s.irregularVerbs || []).forEach((v) => out.push(v));
      (s.items || []).forEach((it) => out.push(it));
    }
    return out;
  },

  allIds() { return this.allItems().map((it) => it.id); },

  /** All ids belonging to one section (for its own progress bar). */
  idsForSection(section) {
    const ids = [];
    (section.verbGroups || []).forEach((v) => ids.push(v.id));
    (section.irregularVerbs || []).forEach((v) => ids.push(v.id));
    (section.items || []).forEach((it) => ids.push(it.id));
    return ids;
  },

  totalCount() { return this.allIds().length; },

  totalMinutes() { return this.allItems().reduce((sum, it) => sum + (it.min || 0), 0); },
  minutesForSection(section) {
    return this.idsForSection(section)
      .map((id) => this.allItems().find((it) => it.id === id))
      .reduce((sum, it) => sum + (it && it.min || 0), 0);
  },
  minutesChecked() {
    return this.allItems().filter((it) => store.isChecked(it.id)).reduce((sum, it) => sum + (it.min || 0), 0);
  },

  /**
   * Splits the full ordered lesson list into `weeks` contiguous chunks,
   * balanced by estimated minutes rather than lesson count, so each week
   * is roughly the same amount of study time. Order follows the PDF's own
   * lesson sequence.
   */
  buildPlan(weeks = 8) {
    const items = this.allItems();
    const total = this.totalMinutes();
    const target = total / weeks;
    const buckets = Array.from({ length: weeks }, () => ({ ids: [], minutes: 0 }));
    let w = 0;
    for (const it of items) {
      const min = it.min || 0;
      // Greedy bin-balancing: once this week already has something in it and
      // adding the next lesson would push it further from the target than
      // starting the next week would, roll over. The last week absorbs
      // whatever remains, so nothing is ever dropped.
      if (w < weeks - 1 && buckets[w].ids.length && buckets[w].minutes + min > target) {
        w++;
      }
      buckets[w].ids.push(it.id);
      buckets[w].minutes += min;
    }
    return buckets;
  }
};
