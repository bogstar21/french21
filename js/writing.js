/* ============================================================
   Writing session = translation drills (active recall) followed
   by a guided composition. Translation first is deliberate: it
   warms up the exact structures the composition then asks for.

   Both stages checkpoint — the drills by position, the
   composition by draft text — so a refresh never costs you work.
   ============================================================ */

const Translation = {
  /** Runner-compatible: one drill. */
  renderItem(host, t, done) {
    host.innerHTML = `
      <div class="ex-card">
        <div class="eyebrow">Translate into French</div>
        <div class="ex-prompt" style="font-size:var(--fs-lg);margin-top:var(--s2)">${UI.esc(t.en)}</div>
        <textarea class="compose" id="tr-in" rows="2" style="min-height:72px"
          placeholder="Écrivez en français…" autocapitalize="sentences" spellcheck="false"></textarea>
        <div class="row" style="margin-top:var(--s4)">
          <button class="btn btn-primary" id="tr-go">Check</button>
          <button class="btn btn-subtle btn-sm" id="tr-skip">Show answer</button>
        </div>
        <div id="tr-out"></div>
      </div>`;

    const input = host.querySelector("#tr-in");
    const go = host.querySelector("#tr-go");
    const skip = host.querySelector("#tr-skip");
    input.focus();

    const finish = (ok) => {
      input.disabled = true; go.disabled = true; skip.disabled = true;
      host.querySelector("#tr-out").innerHTML = UI.feedback(ok, {
        answer: ok ? null : t.accept[0],
        why: t.note
      });
      Speech.say(t.accept[0]);
      done(ok);
    };

    go.onclick = () => finish(UI.matches(input.value, t.accept));
    skip.onclick = () => finish(false);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go.click(); }
    });
  }
};

const Composition = {
  /**
   * Custom runner stage. `cp.draft` holds the in-progress essay and is
   * written back on every keystroke (debounced by the runner's save),
   * so refreshing mid-sentence keeps what you wrote.
   */
  render(host, cp, done, save) {
    const writing = CourseData.getWeek(cp.week).writing;

    host.innerHTML = `
      <div class="ex-card">
        <div class="eyebrow">Composition</div>
        <h2 style="margin:var(--s2) 0 var(--s4)">${UI.esc(writing.prompt)}</h2>

        ${writing.hints?.length ? `
          <div class="eyebrow">Structures to use</div>
          <div class="hint-list">
            ${writing.hints.map((h) => `<div class="hint-item">${UI.esc(h)}</div>`).join("")}
          </div>` : ""}

        ${writing.wordBank?.length ? `
          <div class="eyebrow">Word bank — tap to insert</div>
          <div class="bank">
            ${writing.wordBank.map((w) => `<button class="bank-chip" data-w="${UI.esc(w)}">${UI.esc(w)}</button>`).join("")}
          </div>` : ""}

        <textarea class="compose" id="comp" placeholder="Écrivez votre réponse ici…" spellcheck="false"></textarea>

        <div class="meter" id="meter">
          <span id="meter-text">0 / ${writing.minimumWords} mots</span>
          <div class="meter-track"><div class="meter-fill" id="meter-fill" style="width:0%"></div></div>
          <span class="small muted" id="saved-note"></span>
        </div>

        <button class="btn btn-primary" id="comp-go" disabled>Submit</button>
        <div id="comp-out"></div>
      </div>`;

    const ta = host.querySelector("#comp");
    const meter = host.querySelector("#meter");
    const meterText = host.querySelector("#meter-text");
    const fill = host.querySelector("#meter-fill");
    const go = host.querySelector("#comp-go");
    const savedNote = host.querySelector("#saved-note");

    ta.value = cp.draft || "";

    const count = () => ta.value.trim().split(/\s+/).filter(Boolean).length;
    const update = () => {
      const n = count();
      meterText.textContent = `${n} / ${writing.minimumWords} mots`;
      fill.style.width = Math.min(100, (n / writing.minimumWords) * 100) + "%";
      meter.classList.toggle("ok", n >= writing.minimumWords);
      go.disabled = n < writing.minimumWords;
    };

    let saveTimer;
    ta.addEventListener("input", () => {
      update();
      cp.draft = ta.value;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        save();
        savedNote.textContent = "draft saved";
        setTimeout(() => (savedNote.textContent = ""), 1500);
      }, 600);
    });

    host.querySelectorAll(".bank-chip").forEach((chip) => {
      chip.onclick = () => {
        const sep = ta.value && !/\s$/.test(ta.value) ? " " : "";
        ta.value += sep + chip.dataset.w + " ";
        ta.focus();
        ta.dispatchEvent(new Event("input"));
      };
    });

    go.onclick = () => {
      const text = ta.value;
      ta.disabled = true; go.disabled = true;
      clearTimeout(saveTimer);

      const checks = (writing.checkpoints || []).map((c) => ({
        pass: new RegExp(c.regex, "i").test(text),
        feedback: c.feedback
      }));
      const passed = checks.filter((c) => c.pass).length;
      const score = checks.length ? Math.round((passed / checks.length) * 100) : 100;

      host.querySelector("#comp-out").innerHTML = `
        <div style="margin-top:var(--s6)">
          <div class="eyebrow" style="margin-bottom:var(--s3)">Self-check</div>
          ${checks.map((c) => `
            <div class="check ${c.pass ? "pass" : "miss"}">
              <span>${c.pass ? "✓" : "!"}</span><span>${UI.esc(c.feedback)}</span>
            </div>`).join("")}

          <div class="eyebrow" style="margin:var(--s6) 0 var(--s3)">Model answer — compare, don't copy</div>
          <div class="model-box">${UI.esc(writing.modelAnswer)}
            <div style="margin-top:var(--s3)">
              <button class="speak speak-sm" data-say="${UI.esc(writing.modelAnswer)}">🔊</button>
            </div>
          </div>

          <div style="margin-top:var(--s6);text-align:center">
            <button class="btn btn-primary btn-lg" id="comp-next">Finish session →</button>
          </div>
        </div>`;

      Speech.bind(host);
      host.querySelector("#comp-next").onclick = () => done(score);
      host.querySelector("#comp-out").scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    update();
  }
};
