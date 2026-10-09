/* ============================================================
   Session runner.

   A session is a chain of stages. The runner owns the cursor —
   which stage, which item, how many right so far — and writes a
   checkpoint after **every answer**, so closing the tab or hitting
   refresh resumes exactly where you stopped instead of restarting
   the session.

   Stage kinds
     screen  a page with a Continue button, no score
             { kind:"screen", render(host, done) }
     items   iterate a list, one score for the stage
             { kind:"items", build() -> [], render(host, item, done(ok)) }
     custom  owns its own flow and returns a score
             { kind:"custom", render(host, cp, done(score), save) }

   The item list is captured into the checkpoint the first time a
   stage starts, so a resumed quiz shows the same questions in the
   same order rather than reshuffling.
   ============================================================ */

const Runner = {
  start(host, { week, type, stages, onFinish }) {
    this._host = host;
    this._stages = stages;
    this._onFinish = onFinish;

    const saved = store.checkpointFor(week, type);
    this._cp = saved || {
      week, type,
      stage: 0,
      stageScores: [],
      items: null,
      index: 0,
      correct: 0,
      draft: "",
      elapsedMs: 0
    };
    this._resumed = Boolean(saved && (saved.stage > 0 || saved.index > 0 || saved.draft));
    this._tick = Date.now();

    // Guard against content changes between visits: a stale item list
    // would resume into questions that no longer exist.
    if (this._cp.stage >= stages.length) this._cp = { ...this._cp, stage: 0, items: null, index: 0, correct: 0, stageScores: [] };

    this._runStage();
  },

  /** Restart the current session from scratch. */
  restart() {
    const { week, type } = this._cp;
    store.clearCheckpoint(week, type);
    this._cp = { week, type, stage: 0, stageScores: [], items: null, index: 0, correct: 0, draft: "", elapsedMs: 0 };
    this._resumed = false;
    this._tick = Date.now();
    this._runStage();
  },

  _save() {
    const now = Date.now();
    this._cp.elapsedMs += now - this._tick;
    this._tick = now;
    store.saveCheckpoint(this._cp);
  },

  _runStage() {
    const cp = this._cp;
    if (cp.stage >= this._stages.length) return this._finish();
    const stage = this._stages[cp.stage];

    if (stage.kind === "screen") {
      stage.render(this._host, () => this._nextStage(null));
      this._banner();
      return;
    }

    if (stage.kind === "custom") {
      stage.render(this._host, cp, (score) => this._nextStage(score), () => this._save());
      this._banner();
      return;
    }

    if (!cp.items) {
      cp.items = stage.build();
      cp.index = 0;
      cp.correct = 0;
      this._save();
    }
    this._drawItem(stage);
  },

  _drawItem(stage) {
    const cp = this._cp;

    if (cp.index >= cp.items.length) {
      const total = cp.items.length;
      const score = total ? Math.round((cp.correct / total) * 100) : 100;
      // A stage can own its own end screen (exams show a review instead
      // of a plain score card).
      if (stage.renderResult) {
        stage.renderResult(this._host, { score, total, correct: cp.correct, items: cp.items, missed: cp.missed || [] },
                           () => this._nextStage(score));
        return;
      }
      this._host.innerHTML = UI.result({
        score, correct: cp.correct, total,
        actions: `<button class="btn btn-primary" id="rn-next">Continue →</button>`
      });
      this._host.querySelector("#rn-next").onclick = () => this._nextStage(score);
      return;
    }

    this._host.innerHTML =
      UI.topline(cp.index + 1, cp.items.length) +
      `<div id="rn-slot"></div>`;

    stage.render(this._host.querySelector("#rn-slot"), cp.items[cp.index], (ok) => {
      if (ok) cp.correct += 1;
      else (cp.missed = cp.missed || []).push(cp.index);
      cp.index += 1;
      this._save();                       // ← saved after every single answer
      setTimeout(() => this._drawItem(stage), stage.pace != null ? stage.pace : (ok ? 1100 : 2100));
    });

    this._banner();
  },

  /** One-time "you're back where you left off" notice. */
  _banner() {
    if (!this._resumed) return;
    this._resumed = false;
    UI.toast("Resumed where you left off", "ok");
  },

  _nextStage(score) {
    if (score !== null && score !== undefined) this._cp.stageScores.push(score);
    this._cp.stage += 1;
    this._cp.items = null;
    this._cp.index = 0;
    this._cp.correct = 0;
    this._cp.draft = "";
    this._save();
    this._runStage();
  },

  _finish() {
    const s = this._cp.stageScores;
    const score = s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : 100;
    const minutes = Math.min(90, Math.max(1, Math.round(this._cp.elapsedMs / 60000)));
    store.clearCheckpoint(this._cp.week, this._cp.type);
    this._onFinish(score, minutes);
  }
};
