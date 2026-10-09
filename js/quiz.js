/* ============================================================
   Quiz & exam builders.

   Quizzes are assembled from the week's own material rather
   than stored separately, so content and assessment can never
   drift apart.
   ============================================================ */

const Quiz = {
  _vocabItem(v, pool) {
    const wrong = UI.shuffle(pool.filter((x) => x.id !== v.id)).slice(0, 3).map((x) => x.translation);
    const options = UI.shuffle([v.translation, ...wrong]);
    return {
      type: "multiple_choice",
      question: `Que signifie « ${v.word} » ?`,
      options,
      correctIndex: options.indexOf(v.translation),
      explanation: `${v.word} — ${v.translation}`
    };
  },

  _translationItem(t) {
    return {
      type: "fill_blank",
      instruction: "Traduisez en français",
      sentence: `${t.en}  →  ___`,
      answer: t.accept.join(" / "),
      explanation: t.note || `Réponse : ${t.accept[0]}`
    };
  },

  weekly(n) {
    const week = CourseData.getWeek(n);
    const pool = CourseData.allVocab();
    const items = [
      ...UI.shuffle(week.vocab).slice(0, 7).map((v) => this._vocabItem(v, pool)),
      ...UI.shuffle(week.grammar).slice(0, 7),
      ...UI.shuffle(week.reading.questions).slice(0, 3),
      ...UI.shuffle(CourseData.translationsFor(n)).slice(0, 3).map((t) => this._translationItem(t))
    ];
    return UI.shuffle(items).slice(0, 20);
  },

  phaseExam(phase) {
    const { grammar, reading, vocab, translations } = CourseData.phaseExamPool(phase);
    const pool = CourseData.allVocab();
    const items = [
      ...UI.shuffle(vocab).slice(0, 12).map((v) => this._vocabItem(v, pool)),
      ...UI.shuffle(grammar).slice(0, 16),
      ...UI.shuffle(reading.flatMap((r) => r.questions)).slice(0, 6),
      ...UI.shuffle(translations).slice(0, 6).map((t) => this._translationItem(t))
    ];
    return UI.shuffle(items).slice(0, 40);
  },

  /**
   * Exam mode as a Runner stage: answers are withheld until the end, and
   * the cursor is checkpointed like any other stage, so a refresh 30
   * questions in does not cost the whole paper.
   */
  examStage(phase, title) {
    return {
      kind: "items",
      pace: 650,
      build: () => this.phaseExam(phase),
      render: (host, item, done) => {
        // Strip the explanation so nothing is revealed mid-exam.
        Exercises.renderItem(host, { ...item, explanation: "" }, done);
      },
      renderResult: (host, { score, correct, total, items, missed }, next) => {
        const passed = score >= 65;
        host.innerHTML = `
          ${UI.result({
            score, correct, total, xp: 100,
            actions: `<button class="btn btn-primary" id="exam-done">Back to dashboard</button>`
          })}
          <div class="card card-pad" style="margin-top:var(--s6)">
            <div class="row" style="margin-bottom:var(--s4)">
              <span class="status-pill ${passed ? "status-ahead" : "status-behind"}">
                ${passed ? "✓ Passed" : "Not yet — 65% needed"}
              </span>
              <span class="spacer"></span>
              <span class="small muted">${missed.length} to review</span>
            </div>
            ${missed.length ? missed.map((i) => {
              const m = items[i];
              if (!m) return "";
              return `
                <div class="check miss" style="flex-direction:column;align-items:flex-start;gap:var(--s1)">
                  <strong>${UI.esc(m.question || m.statement || m.sentence || m.instruction || "")}</strong>
                  <span class="muted">${UI.esc(
                    m.explanation || (m.options ? m.options[m.correctIndex] : m.answer) || ""
                  )}</span>
                </div>`;
            }).join("") : `<p class="muted small">Nothing missed. Excellent.</p>`}
          </div>`;
        host.querySelector("#exam-done").onclick = next;
      }
    };
  }
};
