/* ============================================================
   Reading passage with tap-to-translate glossary, then
   comprehension questions.
   ============================================================ */

const Reading = {
  render(host, reading, onDone) {
    const glossary = reading.glossary || {};
    const terms = Object.keys(glossary).sort((a, b) => b.length - a.length);

    // Mark glossary terms without letting user content reach innerHTML raw.
    const paragraphs = reading.text.split("\n").filter(Boolean).map((line) => {
      let html = UI.esc(line);
      terms.forEach((t) => {
        const safe = UI.esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Leading boundary is captured rather than looked behind: Safari did
        // not ship regex lookbehind until 16.4, and this has to run there.
        html = html.replace(
          new RegExp(`(^|[^\\w-])(${safe})(?![\\w-])`, "gi"),
          `$1<span class="gloss" data-t="${UI.esc(t)}">$2</span>`
        );
      });
      return `<p>${html}</p>`;
    }).join("");

    const words = reading.text.split(/\s+/).length;

    host.innerHTML = `
      <div class="read-doc">
        <h2>${UI.esc(reading.title)}</h2>
        <div class="read-meta">
          <span>${words} mots</span>
          <span>·</span>
          <span>${terms.length} mots de vocabulaire — tap any underlined word</span>
          <span class="spacer"></span>
          <button class="speak speak-sm" data-say="${UI.esc(reading.text.slice(0, 400))}" title="Read aloud">🔊</button>
        </div>
        <div class="read-body" id="read-body">${paragraphs}</div>
      </div>
      <div style="margin-top:var(--s6);text-align:center">
        <button class="btn btn-primary btn-lg" id="read-go">I've read it — questions →</button>
      </div>`;

    Speech.bind(host);

    // Glossary popover
    let pop = null;
    const close = () => { if (pop) { pop.remove(); pop = null; } };
    host.querySelectorAll(".gloss").forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        close();
        el.classList.add("seen");
        const term = el.dataset.t;
        pop = document.createElement("div");
        pop.className = "pop";
        pop.innerHTML = `<b>${UI.esc(term)}</b> — ${UI.esc(glossary[term])}`;
        document.body.appendChild(pop);
        const r = el.getBoundingClientRect();
        const pr = pop.getBoundingClientRect();
        pop.style.left = Math.min(window.innerWidth - pr.width - 12, Math.max(12, r.left)) + "px";
        pop.style.top = (r.bottom + 8 + pr.height > window.innerHeight ? r.top - pr.height - 8 : r.bottom + 8) + "px";
        Speech.say(term);
      };
    });
    document.addEventListener("click", close);
    document.addEventListener("scroll", close, true);

    host.querySelector("#read-go").onclick = () => {
      close();
      Exercises.run(host, reading.questions, onDone);
    };
  }
};
