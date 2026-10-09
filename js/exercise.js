/* ============================================================
   Grammar exercise engine — fill_blank, multiple_choice, reorder.
   Shared by weekly sessions, quizzes and phase exams.
   ============================================================ */

const Exercises = {
  /** Renders one item into `card`; calls back with (correct: bool). */
  one(card, ex, done) {
    if (ex.type === "fill_blank")      return this.fillBlank(card, ex, done);
    if (ex.type === "reorder")         return this.reorder(card, ex, done);
    if (ex.type === "true_false")      return this.trueFalse(card, ex, done);
    return this.choice(card, ex, done);
  },

  /** Runner-compatible: render one exercise into its own card. */
  renderItem(host, ex, done) {
    host.innerHTML = `<div class="ex-card" id="ex-card"></div>`;
    this.one(host.querySelector("#ex-card"), ex, done);
  },

  /* ---------------- Fill in the blank ---------------- */

  fillBlank(card, ex, done) {
    const [before, after = ""] = ex.sentence.split("___");
    card.innerHTML = `
      <div class="ex-prompt">${UI.esc(ex.instruction)}</div>
      <div class="ex-sentence">${UI.esc(before)}<input class="blank-input" id="fb" autocomplete="off" autocapitalize="off" spellcheck="false">${UI.esc(after)}</div>
      ${ex.hint ? `<div class="ex-hint"><span>💡</span><span>${UI.esc(ex.hint)}</span></div>` : ""}
      <div style="margin-top:var(--s5)"><button class="btn btn-primary" id="fb-go">Check</button></div>
      <div id="fb-out"></div>`;

    const input = card.querySelector("#fb");
    const btn = card.querySelector("#fb-go");
    input.focus();

    const submit = () => {
      const accepted = ex.answer.split("/").map((s) => s.trim());
      const ok = UI.matches(input.value, accepted);
      input.disabled = true; btn.disabled = true;
      input.style.borderBottomColor = ok ? "var(--success)" : "var(--danger)";
      card.querySelector("#fb-out").innerHTML = UI.feedback(ok, {
        answer: ok ? null : ex.answer,
        why: ex.explanation
      });
      done(ok);
    };
    btn.onclick = submit;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  },

  /* ---------------- Multiple choice ---------------- */

  choice(card, ex, done) {
    const prompt = ex.question || ex.sentence || ex.instruction;
    card.innerHTML = `
      <div class="ex-prompt">${UI.esc(prompt)}</div>
      <div class="options">
        ${ex.options.map((o, n) => `
          <button class="option" data-i="${n}">
            <span class="option-key">${String.fromCharCode(65 + n)}</span>
            <span>${UI.esc(o)}</span>
          </button>`).join("")}
      </div>
      <div id="mc-out"></div>`;

    const opts = [...card.querySelectorAll(".option")];
    opts.forEach((btn) => {
      btn.onclick = () => {
        const n = +btn.dataset.i;
        const ok = n === ex.correctIndex;
        opts.forEach((b) => (b.disabled = true));
        btn.classList.add(ok ? "correct" : "incorrect");
        if (!ok) opts[ex.correctIndex].classList.add("reveal");
        card.querySelector("#mc-out").innerHTML = UI.feedback(ok, { why: ex.explanation });
        done(ok);
      };
    });
  },

  /* ---------------- True / false ---------------- */

  trueFalse(card, ex, done) {
    card.innerHTML = `
      <div class="ex-prompt">${UI.esc(ex.statement)}</div>
      <div class="options">
        <button class="option" data-v="1"><span class="option-key">V</span><span>Vrai</span></button>
        <button class="option" data-v="0"><span class="option-key">F</span><span>Faux</span></button>
      </div>
      <div id="tf-out"></div>`;

    const opts = [...card.querySelectorAll(".option")];
    opts.forEach((btn) => {
      btn.onclick = () => {
        const ok = (btn.dataset.v === "1") === ex.answer;
        opts.forEach((b) => (b.disabled = true));
        btn.classList.add(ok ? "correct" : "incorrect");
        if (!ok) opts.find((b) => (b.dataset.v === "1") === ex.answer).classList.add("reveal");
        card.querySelector("#tf-out").innerHTML = UI.feedback(ok, { why: ex.explanation });
        done(ok);
      };
    });
  },

  /* ---------------- Word reordering ---------------- */

  reorder(card, ex, done) {
    const bank = UI.shuffle(ex.words.map((w, idx) => ({ w, idx })));
    let picked = [];

    card.innerHTML = `
      <div class="ex-prompt">${UI.esc(ex.instruction)}</div>
      <div class="reorder-slot" id="slot"></div>
      <div class="reorder-bank" id="bank">
        ${bank.map((b, k) => `<button class="chip" data-idx="${b.idx}" data-k="${k}">${UI.esc(b.w)}</button>`).join("")}
      </div>
      <div style="margin-top:var(--s5)"><button class="btn btn-primary" id="ro-go" disabled>Check</button></div>
      <div id="ro-out"></div>`;

    const slot = card.querySelector("#slot");
    const bankEl = card.querySelector("#bank");
    const go = card.querySelector("#ro-go");

    const sync = () => {
      slot.innerHTML = picked
        .map((p) => `<button class="chip placed" data-k="${p.k}">${UI.esc(p.w)}</button>`)
        .join("");
      go.disabled = picked.length !== ex.words.length;
      slot.querySelectorAll(".chip").forEach((c) => {
        c.onclick = () => {
          picked = picked.filter((p) => p.k !== c.dataset.k);
          const src = bankEl.querySelector(`[data-k="${c.dataset.k}"]`);
          if (src) src.classList.remove("spent");
          sync();
        };
      });
    };

    bankEl.querySelectorAll(".chip").forEach((c) => {
      c.onclick = () => {
        if (c.classList.contains("spent")) return;
        c.classList.add("spent");
        picked.push({ w: c.textContent, idx: +c.dataset.idx, k: c.dataset.k });
        sync();
      };
    });

    go.onclick = () => {
      const ok = JSON.stringify(picked.map((p) => p.idx)) === JSON.stringify(ex.correctOrder);
      go.disabled = true;
      card.querySelectorAll(".chip").forEach((c) => (c.style.pointerEvents = "none"));
      card.querySelector("#ro-out").innerHTML = UI.feedback(ok, {
        answer: ok ? null : ex.correctOrder.map((n) => ex.words[n]).join(" "),
        why: ex.translation ? `“${ex.translation}”` : ""
      });
      done(ok);
    };
  }
};
