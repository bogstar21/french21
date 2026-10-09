/* ============================================================
   Flashcards with SM-2 spaced repetition and a 3D flip.
   Direction alternates so you practise both recognition
   (FR→EN) and recall (EN→FR); recall is the harder, more
   useful direction, so it gets the odd positions.
   ============================================================ */

const Flashcards = {
  render(host, ids, onDone) {
    const words = ids.map((id) => CourseData.vocabById(id)).filter(Boolean);
    if (!words.length) { onDone(100); return; }

    let i = 0, correct = 0;

    const draw = () => {
      if (i >= words.length) {
        const score = Math.round((correct / words.length) * 100);
        host.innerHTML = UI.result({
          score, correct, total: words.length,
          actions: `<button class="btn btn-primary" id="fc-next">Continue →</button>`
        });
        host.querySelector("#fc-next").onclick = () => onDone(score);
        return;
      }

      const w = words[i];
      const recall = i % 2 === 1;                 // EN → FR
      const front = recall ? w.translation : w.word;
      const back  = recall ? w.word : w.translation;
      const e = store.getVocabEntry(w.id);

      host.innerHTML = `
        ${UI.topline(i + 1, words.length)}
        <div class="fc-scene">
          <div class="fc" id="fc">
            <div class="fc-face">
              <div class="fc-lang">${recall ? "English → French" : "French → English"}</div>
              <div class="fc-term">${UI.esc(front)}</div>
              ${!recall ? `<button class="speak" data-say="${UI.esc(w.word)}" title="Hear it">🔊</button>` : ""}
              <div class="fc-tap">Tap the card to reveal</div>
            </div>
            <div class="fc-face back">
              <div class="fc-lang">Answer</div>
              <div class="fc-term">${UI.esc(back)}</div>
              <button class="speak" data-say="${UI.esc(w.word)}" title="Hear it">🔊</button>
              <div class="fc-example">${UI.esc(w.example)}<small>${UI.esc(w.exampleTranslation)}</small></div>
              <div class="fc-actions">
                <button class="btn btn-ghost" id="fc-no">Didn't know</button>
                <button class="btn btn-success" id="fc-yes">Knew it</button>
              </div>
            </div>
          </div>
        </div>
        <div class="srs-strip">
          <span>Status: <b>${e.level}</b></span>
          ${e.correctCount ? `<span>· streak <b>${e.correctCount}</b></span>` : ""}
        </div>`;

      const card = host.querySelector("#fc");
      let flipped = false;

      const flip = () => {
        if (flipped) return;
        flipped = true;
        card.classList.add("flipped");
        if (store.settings.autoSpeak) setTimeout(() => Speech.say(w.word), 260);
      };

      card.addEventListener("click", (ev) => {
        if (ev.target.closest(".fc-actions") || ev.target.closest(".speak")) return;
        flip();
      });

      host.querySelectorAll(".speak").forEach((b) => {
        b.onclick = (ev) => { ev.stopPropagation(); Speech.say(b.dataset.say); };
      });

      const answer = (ok) => {
        store.reviewVocab(w.id, ok);
        if (ok) correct++;
        i++;
        draw();
      };
      host.querySelector("#fc-yes").onclick = (ev) => { ev.stopPropagation(); answer(true); };
      host.querySelector("#fc-no").onclick  = (ev) => { ev.stopPropagation(); answer(false); };

      // Keyboard: space flips, 1/2 answer.
      const keys = (ev) => {
        if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); flip(); }
        else if (flipped && (ev.key === "1" || ev.key.toLowerCase() === "n")) { cleanup(); answer(false); }
        else if (flipped && (ev.key === "2" || ev.key.toLowerCase() === "y")) { cleanup(); answer(true); }
      };
      const cleanup = () => document.removeEventListener("keydown", keys);
      document.addEventListener("keydown", keys);
      host._cleanupKeys = cleanup;
    };

    draw();
  }
};
