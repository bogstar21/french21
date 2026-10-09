/* ============================================================
   Flashcards with SM-2 spaced repetition and a 3D flip.

   Renders one card at a time; Runner owns the cursor and the
   progress bar, so a refresh resumes on the same card.

   Direction alternates by position so you practise both
   recognition (FR→EN) and recall (EN→FR). Because the direction
   is derived from the item's index rather than a counter, a
   resumed card is asked the same way round as before.
   ============================================================ */

const Flashcards = {
  /** One card. `item` is { id, i } so direction survives a resume. */
  renderCard(host, item, done) {
    const w = CourseData.vocabById(item.id);
    if (!w) { done(true); return; }

    const recall = item.i % 2 === 1;               // EN → FR
    const front = recall ? w.translation : w.word;
    const back  = recall ? w.word : w.translation;
    const e = store.getVocabEntry(w.id);

    host.innerHTML = `
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
      document.removeEventListener("keydown", keys);
      store.reviewVocab(w.id, ok);     // SRS state saved immediately, per card
      done(ok);
    };

    host.querySelector("#fc-yes").onclick = (ev) => { ev.stopPropagation(); answer(true); };
    host.querySelector("#fc-no").onclick  = (ev) => { ev.stopPropagation(); answer(false); };

    const keys = (ev) => {
      if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); flip(); }
      else if (flipped && (ev.key === "1" || ev.key.toLowerCase() === "n")) answer(false);
      else if (flipped && (ev.key === "2" || ev.key.toLowerCase() === "y")) answer(true);
    };
    document.addEventListener("keydown", keys);
  },

  /** Wraps a list of vocabulary ids into runner items. */
  items(ids) {
    return ids.map((id, i) => ({ id, i }));
  }
};
