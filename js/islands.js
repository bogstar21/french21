/* ============================================================
   Language Islands view.

   An "island" (Boris Shekhtman's method) is a short passage about
   your own life, memorised cold, so you can produce it instantly
   in conversation. Each island here has:
     - the passage itself, checkable as one unit
     - supporting phrases, checkable individually

   Ticking means "I can say this without reading it" — which is a
   higher bar than the lesson checklist's "I watched this".
   ============================================================ */

const IslandData = {
  islands: [],
  howTo: [],
  loaded: false,

  async load() {
    if (this.loaded) return;
    const r = await fetch("data/islands.json");
    const d = await r.json();
    this.islands = d.islands;
    this.howTo = d.howTo || [];
    this.loaded = true;
  },

  /** Every checkable id: the monologue plus each phrase. */
  idsForIsland(isl) {
    const ids = [isl.monologue.id];
    (isl.groups || []).forEach((g) => g.phrases.forEach((p) => ids.push(p.id)));
    return ids;
  },

  allIds() {
    return this.islands.flatMap((i) => this.idsForIsland(i));
  },

  totalCount() { return this.allIds().length; }
};

const Islands = {
  render(root) {
    const total = IslandData.totalCount();
    const done = store.countChecked(IslandData.allIds());
    const pct = total ? Math.round((done / total) * 100) : 0;

    root.innerHTML = `
      <div class="hero hero-islands">
        <div class="hero-eyebrow">Language Islands · méthode Shekhtman</div>
        <h1 class="hero-title">Mes îlots</h1>
        <p class="hero-sub">Short passages about your own life, memorised until they come out without thinking. They buy you fluency on the topics that come up in every single conversation — who you are, what you do, your family, your running.</p>
        <div class="hero-stats">
          <div><div class="hero-stat-value" id="isl-done">${done}</div><div class="hero-stat-label">of ${total} lines memorised</div></div>
          <div><div class="hero-stat-value" id="isl-pct">${pct}%</div><div class="hero-stat-label">complete</div></div>
          <div><div class="hero-stat-value">${IslandData.islands.length}</div><div class="hero-stat-label">islands</div></div>
        </div>
        <div class="hero-track"><i id="isl-track-fill" style="width:${pct}%"></i></div>
      </div>

      <details class="howto">
        <summary>How to use these ↓</summary>
        <ol>${IslandData.howTo.map((s) => `<li>${UI.esc(s)}</li>`).join("")}</ol>
      </details>

      <div class="toolbar">
        <input class="search" id="isl-search" placeholder="Search any phrase…" autocomplete="off">
      </div>

      <nav class="jumpnav">
        ${IslandData.islands.map((i) => `<a href="#isl-${i.id}">${i.icon} ${UI.esc(i.title)}</a>`).join("")}
      </nav>

      ${IslandData.islands.map((i) => this.renderIsland(i)).join("")}

      <div class="footer-bar">
        <span class="small muted">Tick a line only when you can say it <em>without reading it</em>.</span>
        <button class="btn btn-ghost btn-sm" id="settings-btn">⚙ Settings</button>
      </div>`;
  },

  renderIsland(isl) {
    const ids = IslandData.idsForIsland(isl);
    const done = store.countChecked(ids);
    const total = ids.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const monoOn = store.isChecked(isl.monologue.id);

    const searchText = (isl.monologue.lines.map((l) => l.fr + " " + l.en).join(" ")).toLowerCase();

    return `
      <section class="section collapsed island" id="isl-${isl.id}" data-island="${isl.id}">
        <div class="section-head" data-toggle>
          <span class="island-icon">${isl.icon}</span>
          <h2>${UI.esc(isl.title)}<span class="island-sub">${UI.esc(isl.titleEn)}</span></h2>
          <div class="section-progress">
            <span class="count" data-isl-count>${done}/${total}</span>
            <span data-isl-ring>${App.ringSvg(pct)}</span>
          </div>
          <span class="section-chev">⌄</span>
        </div>
        <div class="section-body">
          <p class="island-why">${UI.esc(isl.why)}</p>

          <div class="mono-card ${monoOn ? "done" : ""}" data-id="${isl.monologue.id}"
               data-title="${UI.esc(searchText)}">
            <div class="mono-head">
              <span class="check">${CHECK_SVG}</span>
              <span class="mono-label">Le passage — à mémoriser</span>
              <span class="mono-hint">tick when you can say it from memory</span>
            </div>
            <div class="mono-lines">
              ${isl.monologue.lines.map((l) => `
                <div class="mono-line">
                  <div class="fr">${UI.esc(l.fr)}</div>
                  <div class="en">${UI.esc(l.en)}</div>
                  ${l.lit ? `<div class="lit">${UI.esc(l.lit)}</div>` : ""}
                </div>`).join("")}
            </div>
          </div>

          ${(isl.groups || []).map((g) => `
            <div class="subhead">${UI.esc(g.title)}</div>
            <div class="list">
              ${g.phrases.map((p) => this.renderPhrase(p)).join("")}
            </div>`).join("")}
        </div>
      </section>`;
  },

  renderPhrase(p) {
    const on = store.isChecked(p.id);
    return `
      <div class="row phrase ${on ? "done" : ""}" data-id="${p.id}"
           data-title="${UI.esc((p.fr + " " + p.en).toLowerCase())}">
        <span class="check">${CHECK_SVG}</span>
        <span class="phrase-body">
          <span class="phrase-fr">${UI.esc(p.fr)}</span>
          <span class="phrase-en">${UI.esc(p.en)}</span>
          ${p.lit ? `<span class="phrase-lit">${UI.esc(p.lit)}</span>` : ""}
        </span>
      </div>`;
  },

  /** Refresh counters without a full re-render. */
  updateProgress(root) {
    root.querySelectorAll("[data-id]").forEach((el) => {
      el.classList.toggle("done", store.isChecked(el.dataset.id));
    });

    const total = IslandData.totalCount();
    const done = store.countChecked(IslandData.allIds());
    const pct = total ? Math.round((done / total) * 100) : 0;

    const d = document.getElementById("isl-done");
    const p = document.getElementById("isl-pct");
    const f = document.getElementById("isl-track-fill");
    if (d) d.textContent = done;
    if (p) p.textContent = pct + "%";
    if (f) f.style.width = pct + "%";

    const bar = document.getElementById("topbar-progress");
    if (bar) bar.innerHTML = `<div class="bar"><i style="width:${pct}%"></i></div><span class="count">${done}/${total}</span>`;

    IslandData.islands.forEach((isl) => {
      const ids = IslandData.idsForIsland(isl);
      const dn = store.countChecked(ids);
      const tt = ids.length;
      const pc = tt ? Math.round((dn / tt) * 100) : 0;
      const el = root.querySelector(`[data-island="${isl.id}"]`);
      if (!el) return;
      const c = el.querySelector("[data-isl-count]");
      const r = el.querySelector("[data-isl-ring]");
      if (c) c.textContent = `${dn}/${tt}`;
      if (r) r.innerHTML = App.ringSvg(pc);
    });
  }
};
