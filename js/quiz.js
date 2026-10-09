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

  /** Exam mode: no per-question reveal until the end, like a real test. */
  runExam(host, items, onDone, title) {
    let i = 0;
    const answers = [];

    const draw = () => {
      if (i >= items.length) return finish();
      host.innerHTML = `
        <div class="eyebrow" style="text-align:center;margin-bottom:var(--s3)">${UI.esc(title)}</div>
        ${UI.topline(i + 1, items.length)}
        <div class="ex-card" id="ex-card"></div>`;
      // Suppress inline feedback by stripping explanations for exam items.
      const item = { ...items[i] };
      const shown = { ...item, explanation: "" };
      Exercises.one(host.querySelector("#ex-card"), shown, (ok) => {
        answers.push({ item, ok });
        i++;
        setTimeout(draw, 650);
      });
    };

    const finish = () => {
      const correct = answers.filter((a) => a.ok).length;
      const score = Math.round((correct / items.length) * 100);
      const passed = score >= 65;
      const missed = answers.filter((a) => !a.ok);

      host.innerHTML = `
        ${UI.result({
          score, correct, total: items.length, xp: 100,
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
          ${missed.length ? missed.map((m) => `
            <div class="check miss" style="flex-direction:column;align-items:flex-start;gap:var(--s1)">
              <strong>${UI.esc(m.item.question || m.item.statement || m.item.sentence || m.item.instruction)}</strong>
              <span class="muted">${UI.esc(
                m.item.explanation ||
                (m.item.options ? m.item.options[m.item.correctIndex] : m.item.answer) || ""
              )}</span>
            </div>`).join("") : `<p class="muted small">Nothing missed. Excellent.</p>`}
        </div>`;
      host.querySelector("#exam-done").onclick = () => onDone(score);
    };

    draw();
  }
};
