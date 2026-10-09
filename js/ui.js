/* ============================================================
   Shared UI helpers.
   ============================================================ */

const UI = {
  toast(message, kind = "") {
    const box = document.getElementById("toasts");
    const el = document.createElement("div");
    el.className = "toast " + kind;
    el.textContent = message;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => {
      el.classList.remove("in");
      setTimeout(() => el.remove(), 300);
    }, 2800);
  },

  go(hash) { window.location.hash = hash; },

  /** Escapes anything interpolated into innerHTML. */
  esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  },

  /** **bold** → <strong>, applied after escaping. */
  md(s) {
    return this.esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  },

  /**
   * Normalises a typed answer so that accents, case, punctuation and
   * doubled spaces never cause a false negative. Learners at A2 should
   * not lose a point for a missing circumflex.
   */
  normalize(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[’']/g, "'")
      .replace(/[.,!?;:]+$/g, "")
      .replace(/\s+/g, " ");
  },

  matches(input, accepted) {
    const a = this.normalize(input);
    return (Array.isArray(accepted) ? accepted : [accepted]).some(
      (x) => this.normalize(x) === a
    );
  },

  scoreClass(pct) { return pct >= 80 ? "good" : pct >= 60 ? "mid" : "low"; },

  /** Exercise progress header. */
  topline(i, total) {
    return `
      <div class="ex-topline">
        <span class="ex-count">${i} / ${total}</span>
        <div class="ex-bar"><i style="width:${(i / total) * 100}%"></i></div>
      </div>`;
  },

  feedback(ok, { answer, why } = {}) {
    return `
      <div class="feedback ${ok ? "ok" : "bad"}">
        <div class="feedback-head">${ok ? "✓ Correct" : "✕ Not quite"}</div>
        ${!ok && answer ? `<div class="feedback-answer">${this.md(answer)}</div>` : ""}
        ${why ? `<div class="feedback-why">${this.md(why)}</div>` : ""}
      </div>`;
  },

  result({ score, correct, total, xp, actions }) {
    return `
      <div class="result">
        ${xp ? `<div class="xp-pop">+${xp} XP</div>` : ""}
        <div class="eyebrow">Score</div>
        <div class="result-score ${this.scoreClass(score)}">${score}%</div>
        <div class="result-detail">${correct} of ${total} correct</div>
        <div class="result-actions">${actions}</div>
      </div>`;
  },

  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  /** Renders a conjugation/reference table from the grammar JSON. */
  refTable(t) {
    if (!t) return "";
    return `
      <table class="conj-table">
        <thead><tr>${t.headers.map((h) => `<th>${this.esc(h)}</th>`).join("")}</tr></thead>
        <tbody>
          ${t.rows.map((r) => `<tr>${r.map((c) => `<td>${this.md(c)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>`;
  },

  grammarCard(entry, open = false) {
    return `
      <details class="accordion" ${open ? "open" : ""}>
        <summary><span class="rule-tag">S${entry.week}</span> ${this.esc(entry.title)}</summary>
        <div class="accordion-body">
          <p class="small muted">${this.md(entry.summary)}</p>
          ${this.refTable(entry.table)}
          ${entry.pitfall ? `<p class="small"><strong>Watch out —</strong> ${this.md(entry.pitfall)}</p>` : ""}
        </div>
      </details>`;
  }
};
