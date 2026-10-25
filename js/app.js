/* ============================================================
   Single-page app: renders the whole curriculum as one checklist,
   wires sync, search, and section collapse.
   ============================================================ */

const CHECK_SVG = `<svg viewBox="0 0 24 24"><polyline points="4,13 9,18 20,6"></polyline></svg>`;

const App = {
  root: null,

  async init() {
    this.root = document.getElementById("root");
    this.applyTheme();

    Sync.init(store);
    Sync.onStateChange(() => this.renderSyncChip());
    store.onChange(() => {
      if (this.view === "islands") Islands.updateProgress(this.root);
      else if (this.view === "lessons") this.updateProgressDisplays();
    });

    this.renderSyncChip();
    this.root.innerHTML = `<div class="hero"><h1>Loading…</h1></div>`;

    try {
      await Promise.all([CourseData.load(), IslandData.load()]);
    } catch (e) {
      this.root.innerHTML = `
        <div class="hero">
          <h1>Could not load the content</h1>
          <p class="hero-sub">Open this page through a web server, not a <code>file://</code> URL — browsers block local JSON otherwise.</p>
        </div>`;
      return;
    }

    // Bound once, against the persistent #root / topbar — re-binding them on
    // every view switch would stack duplicate handlers.
    this.bindGlobalEvents();

    window.addEventListener("hashchange", () => {
      const v = location.hash === "#islands" ? "islands" : location.hash === "#lessons" ? "lessons" : null;
      if (v && v !== this.view) this.show(v);
    });

    this.show(location.hash === "#islands" ? "islands" : "lessons");
  },

  /* ============================================================
     View switching — two pages, one app
     ============================================================ */

  view: null,

  show(view) {
    this.view = view;
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.view === view)
    );

    if (view === "islands") {
      Islands.render(this.root);
      Islands.updateProgress(this.root);
      this.bindSearch("isl-search");
    } else {
      this.render();
      this.updateProgressDisplays();
      this.bindSearch("search");
    }
    window.scrollTo(0, 0);
  },

  /** The search box is rebuilt by every render, so binding it per render is safe. */
  bindSearch(id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", (e) => this.filter(e.target.value.trim().toLowerCase()));
  },

  bindGlobalEvents() {
    // One delegated handler serves both views — they share the same
    // data-toggle / data-id / settings-btn contract.
    this.root.addEventListener("click", (e) => {
      if (e.target.closest("[data-toggle]")) {
        e.target.closest(".section").classList.toggle("collapsed");
        return;
      }
      if (e.target.closest("a") || e.target.closest("[data-noToggle]")) return;

      const reset = e.target.closest("[data-reset-island]");
      if (reset) {
        const ids = IslandData.phraseIds(reset.dataset.resetIsland);
        store.setManyChecked(ids, false);
        UI.toast("Hidden again — ready for another round");
        return;
      }

      const row = e.target.closest("[data-id]");
      if (row) store.toggle(row.dataset.id);

      if (e.target.id === "settings-btn") this.settingsModal();
    });

    document.getElementById("sync-chip").addEventListener("click", () => this.syncModal());

    document.querySelectorAll(".tab").forEach((t) => {
      t.addEventListener("click", (e) => {
        e.preventDefault();
        location.hash = t.dataset.view === "islands" ? "#islands" : "#lessons";
        if (this.view !== t.dataset.view) this.show(t.dataset.view);
      });
    });
  },

  applyTheme() {
    document.documentElement.setAttribute("data-theme", store.settings.darkMode ? "dark" : "light");
  },

  /* ============================================================
     Progress helpers
     ============================================================ */

  totalChecked() {
    return store.countChecked(CourseData.allIds());
  },

  ringSvg(pct, size = 34) {
    const r = (size - 6) / 2;
    const c = 2 * Math.PI * r;
    const off = c - (pct / 100) * c;
    return `
      <svg class="ring" viewBox="0 0 ${size} ${size}">
        <circle class="ring-bg" cx="${size/2}" cy="${size/2}" r="${r}" />
        <circle class="ring-fg" cx="${size/2}" cy="${size/2}" r="${r}"
          stroke-dasharray="${c}" stroke-dashoffset="${off}"
          transform="rotate(-90 ${size/2} ${size/2})" />
      </svg>`;
  },

  /* ============================================================
     Study plan — splits the curriculum into N weeks of roughly
     equal estimated study time, and tracks pace against today.
     ============================================================ */

  renderPlan() {
    const panel = document.getElementById("plan-panel");
    if (!panel) return;

    const weeks = store.settings.planWeeks || 8;
    const startStr = store.settings.planStart || new Date().toISOString().slice(0, 10);
    const buckets = CourseData.buildPlan(weeks);
    const totalMin = CourseData.totalMinutes();

    const start = new Date(startStr + "T00:00:00");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dayMs = 86400000;
    const elapsedDays = Math.max(0, Math.round((today - start) / dayMs));
    const totalDays = weeks * 7;
    const currentWeek = Math.min(weeks - 1, Math.floor(elapsedDays / 7));

    const minutesDone = CourseData.minutesChecked();
    const expectedMin = Math.min(totalMin, (totalMin / totalDays) * Math.min(elapsedDays, totalDays));
    const delta = minutesDone - expectedMin;
    let status = "ontrack", statusLabel = "On track";
    if (delta > totalMin * 0.03) { status = "ahead"; statusLabel = "Ahead of schedule"; }
    else if (delta < -totalMin * 0.03) { status = "behind"; statusLabel = "Behind schedule"; }

    const fmtDate = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const weekRows = buckets.map((b, i) => {
      const wStart = new Date(start.getTime() + i * 7 * dayMs);
      const wEnd = new Date(wStart.getTime() + 6 * dayMs);
      const done = store.countChecked(b.ids);
      const pct = b.ids.length ? Math.round((done / b.ids.length) * 100) : 0;
      const isCurrent = i === currentWeek && elapsedDays < totalDays;
      const isPast = i < currentWeek;
      return `
        <div class="plan-week ${isCurrent ? "current" : ""}">
          <div class="plan-week-num">${isCurrent ? "→" : ""} Week ${i + 1}</div>
          <div class="plan-week-dates">${fmtDate(wStart)} – ${fmtDate(wEnd)}</div>
          <div class="plan-week-goal">${b.ids.length} lessons · ~${this.fmtHours(b.minutes)}</div>
          <div class="plan-week-bar"><i style="width:${pct}%"></i></div>
          <div class="plan-week-count">${done}/${b.ids.length}</div>
        </div>`;
    }).join("");

    panel.innerHTML = `
      <div class="plan-card">
        <div class="plan-head">
          <div>
            <div class="eyebrow">Study plan</div>
            <h2>Finish in ${weeks} weeks</h2>
          </div>
          <span class="status-pill status-${status}">${statusLabel}</span>
        </div>
        <div class="plan-sub">
          Starting <input type="date" id="plan-start" value="${startStr}"> ·
          ~${this.fmtHours(totalMin / weeks)} a week to finish by
          ${new Date(start.getTime() + totalDays * dayMs).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
        </div>
        <div class="plan-weeks">${weekRows}</div>
      </div>`;

    panel.querySelector("#plan-start").addEventListener("change", (e) => {
      store.setSetting("planStart", e.target.value || new Date().toISOString().slice(0, 10));
      this.renderPlan();
    });
  },

  /* ============================================================
     Render: full page
     ============================================================ */

  render() {
    const total = CourseData.totalCount();
    const done = this.totalChecked();
    const pct = total ? Math.round((done / total) * 100) : 0;
    const totalMin = CourseData.totalMinutes();

    this.root.innerHTML = `
      <div class="hero">
        <div class="hero-eyebrow">The Perfect French with Dylane · A1 → B2</div>
        <h1 class="hero-title">Complete French Self-Study Checklist</h1>
        <p class="hero-sub">Every lesson from the self-study guide, linked straight to its video. Check a lesson off when you finish it — your progress is saved and follows you to any device you sign in on.</p>
        <div class="hero-stats">
          <div><div class="hero-stat-value" id="hero-done">${done}</div><div class="hero-stat-label">of ${total} lessons done</div></div>
          <div><div class="hero-stat-value" id="hero-pct">${pct}%</div><div class="hero-stat-label">complete</div></div>
          <div><div class="hero-stat-value">${this.fmtHours(totalMin)}</div><div class="hero-stat-label">total runtime (est.)</div></div>
        </div>
        <div class="hero-track"><i id="hero-track-fill" style="width:${pct}%"></i></div>
      </div>

      <div id="plan-panel"></div>

      <div class="toolbar">
        <input class="search" id="search" placeholder="Search any lesson…" autocomplete="off">
      </div>

      <nav class="jumpnav">
        ${CourseData.sections.map((s) => `<a href="#sec-${s.id}">${UI.esc(s.title.split("&")[0].split(" with ")[0].trim())}</a>`).join("")}
      </nav>

      ${CourseData.sections.map((s) => this.renderSection(s)).join("")}

      <div class="footer-bar">
        <span class="small muted">238 lessons · <a href="https://theperfectfrench.com" target="_blank" rel="noopener">theperfectfrench.com</a></span>
        <button class="btn btn-ghost btn-sm" id="settings-btn">⚙ Settings</button>
      </div>`;

    this.renderPlan();
  },

  fmtHours(min) {
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return h ? `${h}h ${m ? m + "m" : ""}`.trim() : `${m}m`;
  },

  renderSection(section) {
    const ids = CourseData.idsForSection(section);
    const done = store.countChecked(ids);
    const total = ids.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const minutes = CourseData.minutesForSection(section);

    let body = "";
    if (section.note) {
      body += `<div class="section-note">${UI.esc(section.note)} ${section.noteUrl ? `<a href="${UI.esc(section.noteUrl)}" target="_blank" rel="noopener">Open the IPA chart ↗</a>` : ""}</div>`;
    }

    if (section.verbGroups?.length) {
      body += `<div class="subhead">The 3 verb groups</div><div class="mini-table">`;
      body += section.verbGroups.map((v) => this.renderVerbGroupRow(v)).join("");
      body += `</div>`;
    }
    if (section.irregularVerbs?.length) {
      body += `<div class="subhead">10 essential irregular verbs</div><div class="mini-table">`;
      body += section.irregularVerbs.map((v) => this.renderIrregularRow(v)).join("");
      body += `</div>`;
    }

    if (section.id === "complex-conjugation") {
      body += (section.items || []).map((it) => this.renderFeatureCard(it)).join("");
    } else {
      body += `<div class="list">${this.renderItems(section.items || [])}</div>`;
    }

    if (section.playlist) {
      body += `
        <div class="ref-list">
          <a class="ref-link" href="${UI.esc(section.playlist)}" target="_blank" rel="noopener">
            <span class="ico">▶</span><span>See the complete, up-to-date playlist on YouTube ↗</span>
          </a>
        </div>`;
    }
    if (section.books?.length) {
      body += `<div class="subhead">The books</div><div class="ref-list">`;
      body += section.books.map((b) => `
        <a class="ref-link" href="${UI.esc(b.url)}" target="_blank" rel="noopener">
          <span class="ico">📖</span><span>${UI.esc(b.title)} ↗</span>
        </a>`).join("");
      body += `</div>`;
    }

    return `
      <section class="section collapsed" id="sec-${section.id}" data-section="${section.id}">
        <div class="section-head" data-toggle>
          <h2>${UI.esc(section.title)}</h2>
          <span class="section-time">~${this.fmtHours(minutes)}</span>
          <div class="section-progress">
            <span class="count" data-sec-count>${done}/${total}</span>
            <span data-sec-ring>${this.ringSvg(pct)}</span>
          </div>
          <span class="section-chev">⌄</span>
        </div>
        <div class="section-body">${body}</div>
      </section>`;
  },

  renderItems(items) {
    let html = "";
    let lastGroup = null;
    for (const it of items) {
      if (it.subhead) html += `<div class="subhead">${UI.esc(it.subhead)}</div>`;
      html += this.renderRow(it);
      lastGroup = it.group;
    }
    return html;
  },

  renderRow(it) {
    const on = store.isChecked(it.id);
    const hasVideo = !!it.video;
    return `
      <div class="row ${on ? "done" : ""}" data-id="${it.id}" data-title="${UI.esc(it.title.toLowerCase())}">
        <span class="check">${CHECK_SVG}</span>
        ${it.num != null ? `<span class="row-num">${it.num}.</span>` : ""}
        <span class="row-title">${UI.esc(it.title)}</span>
        <span class="row-meta">
          ${it.min ? `<span class="row-min">~${it.min}m</span>` : ""}
          ${it.group ? `<span class="group-tag ${it.group.toLowerCase()}">${it.group === "GRAMMAR" ? "Gr" : "Conj"}</span>` : ""}
          ${it.exercises ? `<span class="row-ex">Ex. ${UI.esc(it.exercises)}</span>` : ""}
        </span>
        ${hasVideo
          ? `<a class="watch" href="${UI.esc(it.video)}" target="_blank" rel="noopener" data-noToggle title="Watch the lesson">▶</a>`
          : `<span class="watch disabled" title="Not published yet">▶</span>`}
      </div>`;
  },

  renderVerbGroupRow(v) {
    const on = store.isChecked(v.id);
    return `
      <div class="mini-row ${on ? "done" : ""}" data-id="${v.id}" data-title="${UI.esc((v.group + " " + v.pattern).toLowerCase())}">
        <span class="check">${CHECK_SVG}</span>
        <div class="mini-title"><b>${UI.esc(v.group)}</b> — ${UI.esc(v.pattern)}
          <div class="mini-sub">e.g. ${UI.esc(v.example)}</div>
        </div>
        ${v.min ? `<span class="row-min">~${v.min}m</span>` : ""}
        <div class="links2">
          ${v.ruleUrl ? `<a class="watch watch-sm" href="${UI.esc(v.ruleUrl)}" target="_blank" rel="noopener" data-noToggle title="Rule">▶</a>` : ""}
          ${v.exampleUrl ? `<a class="watch watch-sm" href="${UI.esc(v.exampleUrl)}" target="_blank" rel="noopener" data-noToggle title="Example verb">▶</a>` : ""}
        </div>
      </div>`;
  },

  renderIrregularRow(v) {
    const on = store.isChecked(v.id);
    return `
      <div class="mini-row ${on ? "done" : ""}" data-id="${v.id}" data-title="${UI.esc(v.verb.toLowerCase())}">
        <span class="check">${CHECK_SVG}</span>
        <div class="mini-title"><b>${UI.esc(v.verb)}</b> — ${UI.esc(v.meaning)}</div>
        ${v.min ? `<span class="row-min">~${v.min}m</span>` : ""}
        ${v.video ? `<a class="watch watch-sm" href="${UI.esc(v.video)}" target="_blank" rel="noopener" data-noToggle title="Watch">▶</a>` : ""}
      </div>`;
  },

  renderFeatureCard(it) {
    const on = store.isChecked(it.id);
    return `
      <div class="feature-card ${on ? "done" : ""}" data-id="${it.id}" data-title="${UI.esc(it.title.toLowerCase())}">
        <span class="check">${CHECK_SVG}</span>
        <span class="feature-title">${UI.esc(it.title)}</span>
        ${it.min ? `<span class="row-min">~${it.min}m</span>` : ""}
        ${it.video ? `<a class="btn btn-ghost btn-sm" href="${UI.esc(it.video)}" target="_blank" rel="noopener" data-noToggle>▶ Watch</a>` : ""}
      </div>`;
  },

  /* ============================================================
     Events
     ============================================================ */


  filter(q) {
    const rows = this.root.querySelectorAll("[data-title]");
    rows.forEach((row) => {
      const match = !q || row.dataset.title.includes(q);
      row.classList.toggle("hidden", !match);
    });
    this.root.querySelectorAll(".section").forEach((sec) => {
      if (!q) {
        // Search cleared: restore whatever collapse state the section was
        // in before the search (we don't force-expand, since collapsed is
        // the default), just make sure it isn't left hidden.
        sec.style.display = "";
        if (sec.dataset.wasCollapsed !== undefined) {
          sec.classList.toggle("collapsed", sec.dataset.wasCollapsed === "1");
          delete sec.dataset.wasCollapsed;
        }
        return;
      }
      if (sec.dataset.wasCollapsed === undefined) {
        sec.dataset.wasCollapsed = sec.classList.contains("collapsed") ? "1" : "0";
      }
      const anyVisible = [...sec.querySelectorAll("[data-title]")].some((r) => !r.classList.contains("hidden"));
      sec.classList.toggle("collapsed", !anyVisible);
    });
  },

  /* ============================================================
     Progress display updates (no full re-render)
     ============================================================ */

  updateProgressDisplays() {
    // Refresh every row's checked state from the store — covers both a local
    // toggle and a merge that just pulled in changes from another device.
    this.root.querySelectorAll("[data-id]").forEach((el) => {
      el.classList.toggle("done", store.isChecked(el.dataset.id));
    });

    const total = CourseData.totalCount();
    const done = this.totalChecked();
    const pct = total ? Math.round((done / total) * 100) : 0;

    const heroDone = document.getElementById("hero-done");
    const heroPct = document.getElementById("hero-pct");
    const heroFill = document.getElementById("hero-track-fill");
    if (heroDone) heroDone.textContent = done;
    if (heroPct) heroPct.textContent = pct + "%";
    if (heroFill) heroFill.style.width = pct + "%";

    const topbar = document.getElementById("topbar-progress");
    if (topbar) {
      topbar.innerHTML = `<div class="bar"><i style="width:${pct}%"></i></div><span class="count">${done}/${total}</span>`;
    }

    CourseData.sections.forEach((s) => {
      const ids = CourseData.idsForSection(s);
      const d = store.countChecked(ids);
      const t = ids.length;
      const p = t ? Math.round((d / t) * 100) : 0;
      const el = this.root.querySelector(`[data-section="${s.id}"]`);
      if (!el) return;
      const countEl = el.querySelector("[data-sec-count]");
      const ringEl = el.querySelector("[data-sec-ring]");
      if (countEl) countEl.textContent = `${d}/${t}`;
      if (ringEl) ringEl.innerHTML = this.ringSvg(p);
    });

    this.renderPlan();
  },

  /* ============================================================
     Sync chip + modals
     ============================================================ */

  renderSyncChip() {
    const chip = document.getElementById("sync-chip");
    if (!chip) return;
    chip.dataset.state = Sync.state;
    chip.querySelector(".sync-txt").textContent = Sync.label();
  },

  syncModal() {
    if (!Sync.available) return this.setupModal();
    if (Sync.state === "signed-out") return this.authModal();
    this.accountModal();
  },

  _modal(html) {
    const prev = document.querySelector(".overlay");
    if (prev) prev.remove();
    const o = document.createElement("div");
    o.className = "overlay";
    o.innerHTML = `<div class="modal">${html}</div>`;
    o.addEventListener("click", (e) => { if (e.target === o) o.remove(); });
    document.body.appendChild(o);
    return o;
  },

  setupModal() {
    this._modal(`
      <h2>Cross-device sync</h2>
      <p class="modal-sub">Progress is saved in this browser only. Fifteen minutes of setup on Railway makes it follow you everywhere.</p>
      <ol class="setup-steps">
        <li>Railway → your service → <strong>Variables</strong> → add <code>APP_PASSWORD</code></li>
        <li>Railway → <strong>Settings → Volumes</strong> → add a volume, so progress survives redeploys</li>
        <li>Reload this page and sign in with that password</li>
      </ol>
      <p class="small muted" style="margin-top:var(--s4)">Full instructions are in <code>SETUP.md</code>.</p>
      <div class="modal-foot">
        <button class="btn btn-primary btn-block" onclick="this.closest('.overlay').remove()">Got it</button>
      </div>`);
  },

  authModal() {
    const o = this._modal(`
      <h2>Sign in</h2>
      <p class="modal-sub">One password keeps every checked lesson identical on every device. You stay signed in for 90 days.</p>
      <div id="auth-err"></div>
      <div class="field">
        <label for="au-pass">Password</label>
        <input type="password" id="au-pass" autocomplete="current-password" autofocus>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" id="au-cancel">Cancel</button>
        <button class="btn btn-primary" style="flex:1" id="au-go">Sign in</button>
      </div>`);

    const err = o.querySelector("#auth-err");
    const go = o.querySelector("#au-go");
    const input = o.querySelector("#au-pass");
    input.focus();

    const submit = async () => {
      if (!input.value) {
        err.innerHTML = `<div class="modal-error">Enter your password.</div>`;
        return;
      }
      go.disabled = true; go.textContent = "Signing in…";
      try {
        await Sync.signIn(input.value);
        o.remove();
        UI.toast("Signed in — progress is syncing", "ok");
      } catch (e) {
        err.innerHTML = `<div class="modal-error">${UI.esc(e.message)}</div>`;
        go.disabled = false; go.textContent = "Sign in";
        input.select();
      }
    };
    go.onclick = submit;
    o.querySelector("#au-cancel").onclick = () => o.remove();
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  },

  accountModal() {
    const o = this._modal(`
      <h2>Synced</h2>
      <p class="modal-sub">Every checkbox uploads a second or two after you click it, and pulls in changes from your other devices automatically.</p>
      ${!Sync.persistent ? `<div class="modal-error">No volume is attached on Railway — progress will be erased on the next redeploy. Add one under Settings → Volumes.</div>` : ""}
      <div class="modal-foot">
        <button class="btn btn-ghost" id="ac-out">Sign out</button>
        <button class="btn btn-primary" style="flex:1" id="ac-close">Done</button>
      </div>`);
    o.querySelector("#ac-close").onclick = () => o.remove();
    o.querySelector("#ac-out").onclick = async () => {
      await Sync.signOut();
      o.remove();
      UI.toast("Signed out — this device keeps its local copy");
    };
  },

  settingsModal() {
    const s = store.settings;
    const o = this._modal(`
      <h2>Settings</h2>
      <div class="setting">
        <div><div class="setting-label">Dark mode</div><div class="setting-desc">Stays on this device</div></div>
        <label class="switch"><input type="checkbox" id="s-dark" ${s.darkMode ? "checked" : ""}><span></span></label>
      </div>
      <div class="setting">
        <div><div class="setting-label">Reset progress</div><div class="setting-desc">Unchecks everything${Sync.available && Sync.state !== "signed-out" ? " on this device and the synced copy" : " on this device"}</div></div>
        <button class="btn btn-danger btn-sm" id="s-reset">Reset</button>
      </div>
      <div class="modal-foot">
        <button class="btn btn-primary btn-block" onclick="this.closest('.overlay').remove()">Close</button>
      </div>`);

    o.querySelector("#s-dark").onchange = (e) => {
      store.setSetting("darkMode", e.target.checked);
      this.applyTheme();
    };
    o.querySelector("#s-reset").onclick = () => {
      if (confirm("Reset all progress? This cannot be undone.")) {
        store.reset();
        UI.toast("Progress reset");
        o.remove();
        this.render();
        this.bindEvents();
      }
    };
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
