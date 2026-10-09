/* ============================================================
   Listening session: this week's recommended source(s), then
   comprehension questions.

   Deliberately links channels and shows rather than embedding
   fixed video IDs — individual videos disappear, channels don't.
   ============================================================ */

const Listening = {
  render(host, week, listening, onDone) {
    const res = CourseData.resourcesFor(week.week);
    const icon = { youtube: "▶", podcast: "🎧", article: "📰" };

    const card = (r, primary = false) => `
      <a class="resource" href="${UI.esc(r.url)}" target="_blank" rel="noopener">
        <div class="resource-ico">${icon[r.kind] || "🔗"}</div>
        <div style="flex:1;min-width:0">
          <div class="resource-name">
            ${UI.esc(r.name)}
            <span class="level-tag">${UI.esc(r.level)}</span>
            ${primary ? `<span class="level-tag" style="background:var(--accent-soft);color:var(--accent)">THIS WEEK</span>` : ""}
          </div>
          <div class="resource-desc">${UI.esc(r.why)}</div>
        </div>
        <div class="chev">↗</div>
      </a>`;

    host.innerHTML = `
      <div class="ex-card">
        <div class="eyebrow">Listening — semaine ${week.week}</div>
        <h2 style="margin:var(--s2) 0 var(--s3)">${UI.esc(listening.title)}</h2>
        <p class="muted small">${UI.esc(listening.description || "")}</p>

        ${res.focus ? `<div class="grammar-note" style="margin:var(--s5) 0"><strong>What to listen for —</strong> ${UI.esc(res.focus)}</div>` : ""}

        ${listening.videoId ? `
          <div class="media-frame">
            <iframe src="https://www.youtube.com/embed/${UI.esc(listening.videoId)}"
              allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
              allowfullscreen loading="lazy"></iframe>
          </div>` : ""}

        ${res.primary ? card(res.primary, true) : ""}
        ${res.extra.map((r) => card(r)).join("")}

        ${listening.searchHint ? `
          <a class="resource" href="https://www.youtube.com/results?search_query=${encodeURIComponent(listening.searchHint)}"
             target="_blank" rel="noopener">
            <div class="resource-ico">🔎</div>
            <div style="flex:1;min-width:0">
              <div class="resource-name">Search YouTube for this week's topic</div>
              <div class="resource-desc">“${UI.esc(listening.searchHint)}”</div>
            </div>
            <div class="chev">↗</div>
          </a>` : ""}

        <div style="margin-top:var(--s6);text-align:center">
          <button class="btn btn-primary btn-lg" id="ls-go">I've listened — questions →</button>
          <div class="small muted" style="margin-top:var(--s3)">Aim for 10–15 minutes of listening before continuing.</div>
        </div>
      </div>`;

    host.querySelector("#ls-go").onclick = () => {
      Exercises.run(host, listening.questions, onDone);
    };
  }
};
