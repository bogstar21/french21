/* ============================================================
   Router and views.
   ============================================================ */

const App = {
  root: null,

  async init() {
    this.root = document.getElementById("root");
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    Speech.init();
    this.applyTheme();

    Sync.init(store);
    Sync.onStateChange(() => this.renderSyncChip());
    store.onChange(() => {
      if (/^#?(dashboard)?$/.test(location.hash)) this.dashboard();
      this.renderSyncChip();
    });

    this.renderSyncChip();
    this.root.innerHTML = this.skeleton();

    try {
      await CourseData.load();
    } catch (e) {
      this.root.innerHTML = `
        <div class="empty">
          <div class="empty-ico">⚠️</div>
          <h2>Could not load the course content</h2>
          <p class="muted">Open this page through a web server, not as a <code>file://</code> URL — browsers block local JSON otherwise.</p>
        </div>`;
      return;
    }

    window.addEventListener("hashchange", () => this.route());
    this.route();
  },

  skeleton() {
    return `<div class="stack">
      <div class="skeleton" style="height:150px"></div>
      <div class="skeleton" style="height:70px"></div>
      <div class="skeleton" style="height:230px"></div>
    </div>`;
  },

  applyTheme() {
    document.documentElement.setAttribute(
      "data-theme", store.settings.darkMode ? "dark" : "light"
    );
  },

  route() {
    const [view, a, b] = (location.hash.slice(1) || "dashboard").split("/");
    document.querySelectorAll(".nav-link").forEach((l) =>
      l.classList.toggle("active", l.dataset.v === view)
    );

    switch (view) {
      case "week":       this.week(+a); break;
      case "session":    this.session(+a, b); break;
      case "exam":       this.exam(+a); break;
      case "vocabulary": this.vocabulary(); break;
      case "grammar":    this.grammar(); break;
      case "profile":    this.profile(); break;
      default:           this.dashboard();
    }

    // After render, not before: the browser restores the previous scroll
    // offset on hash navigation, which otherwise drops you mid-page.
    window.scrollTo(0, 0);
  },

  /* ============================================================
     Sync chip + auth
     ============================================================ */

  renderSyncChip() {
    const chip = document.getElementById("sync-chip");
    if (!chip) return;
    chip.dataset.state = Sync.state;
    chip.querySelector("span:last-child").textContent = Sync.label();
    chip.onclick = () => this.syncModal();
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
      <p class="modal-sub">Progress is saved in this browser only. To carry it between your laptop and your phone, the app needs to be running on the server with a password set.</p>
      <ol class="setup-steps">
        <li>Railway → your service → <strong>Variables</strong> → add <code>APP_PASSWORD</code></li>
        <li>Railway → <strong>Settings → Volumes</strong> → add a volume, so progress survives redeploys</li>
        <li>Reload this page and sign in with that password</li>
      </ol>
      <p class="small muted" style="margin-top:var(--s4)">Full details are in <code>SETUP.md</code>.</p>
      <div class="modal-foot">
        <button class="btn btn-primary btn-block" onclick="this.closest('.overlay').remove()">Got it</button>
      </div>`);
  },

  authModal() {
    const o = this._modal(`
      <h2>Sign in</h2>
      <p class="modal-sub">One password keeps your streak, vocabulary and scores identical on every device. You stay signed in for 90 days.</p>
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
      <p class="modal-sub">Progress uploads a second or two after each answer, and pulls in changes from your other devices when you open the tab.</p>
      ${!Sync.persistent ? `<div class="modal-error">No volume is attached on Railway — progress will be erased on the next redeploy. Add one under Settings → Volumes.</div>` : ""}
      ${Sync.lastError && Sync.state === "error" ? `<div class="modal-error">${UI.esc(Sync.lastError)}</div>` : ""}
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

  /* ============================================================
     Dashboard
     ============================================================ */

  dashboard() {
    const p = store.pace();
    const lvl = store.getLevel();
    const vs = store.vocabStats();
    const mins = store.minutesThisWeek();
    const weekTarget = 240;

    const nextWeek = Math.min(12, store.data.progress.currentWeek);
    const w = CourseData.getWeek(nextWeek);
    const wp = store.getWeekProgress(nextWeek);
    const nextSession = ["grammar", "listening", "writing", "review"]
      .find((s) => !wp.sessions[s]?.completed) || "grammar";

    const phases = [1, 2, 3].map((n) => {
      const weeks = CourseData.getPhaseWeeks(n);
      const done = weeks.filter((x) => store.getWeekProgress(x.week).status === "completed").length;
      const exam = store.data.progress.phaseExams[n];
      const allDone = done === weeks.length;

      return `
        <section class="phase">
          <div class="section-head">
            <div>
              <div class="eyebrow">Phase ${n} · Semaines ${PHASES[n].weeks}</div>
              <h2>${PHASES[n].name}</h2>
              <div class="section-sub">${PHASES[n].blurb}</div>
            </div>
            <div class="small muted">${done}/${weeks.length} complete</div>
          </div>
          <div class="phase-bar"><i style="width:${(done / weeks.length) * 100}%"></i></div>
          <div class="week-grid">
            ${weeks.map((x) => this.weekCard(x)).join("")}
          </div>
          ${allDone ? `
            <div style="margin-top:var(--s4);text-align:center">
              <button class="btn ${exam ? "btn-ghost" : "btn-primary"}" onclick="UI.go('exam/${n}')">
                ${exam ? `Retake Phase ${n} exam · best ${exam.score}%` : `Take the Phase ${n} exam →`}
              </button>
            </div>` : ""}
        </section>`;
    }).join("");

    this.root.innerHTML = `
      <div class="hero">
        <div class="hero-main">
          <div class="hero-eyebrow">${wp.status === "completed" ? "Next up" : "Continue"}</div>
          <div class="hero-title">Semaine ${nextWeek} — ${UI.esc(w.theme)}</div>
          <div class="hero-meta">${SESSIONS[nextSession].name} · ${UI.esc(w.grammarPoint)}</div>
          <button class="btn btn-lg" onclick="UI.go('session/${nextWeek}/${nextSession}')">
            Start ${SESSIONS[nextSession].day} session →
          </button>
        </div>

        <div class="card card-pad pace-card">
          <div class="pace-row">
            <span class="pace-label">Progress to 31 December</span>
            <span class="status-pill status-${p.status}">${p.label}</span>
          </div>
          <div>
            <div class="pace-track">
              <div class="pace-fill" style="width:${p.percentDone}%"></div>
              <div class="pace-marker" style="left:${p.percentElapsed}%" title="Where you should be today"></div>
            </div>
            <div class="pace-legend" style="margin-top:var(--s2)">
              <span class="pace-key"><i style="background:var(--primary)"></i>${p.completed}/12 weeks done</span>
              <span class="pace-key"><i style="background:var(--accent)"></i>today</span>
            </div>
          </div>
          <div class="pace-row">
            <span class="pace-label">Days remaining</span>
            <span class="pace-value">${p.daysLeft}</span>
          </div>
          <div class="pace-row">
            <span class="pace-label">This week</span>
            <span class="pace-value">${Math.floor(mins / 60)}h ${mins % 60}m <span class="small muted">/ 4h</span></span>
          </div>
          <div class="pace-track" style="height:5px">
            <div class="pace-fill" style="width:${Math.min(100, (mins / weekTarget) * 100)}%;background:var(--accent)"></div>
          </div>
        </div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-label">Streak</div>
          <div class="stat-value">${store.data.progress.streak.current}<span class="small muted" style="font-size:var(--fs-sm)"> days</span></div>
          <div class="stat-sub">best ${store.data.progress.streak.longest}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Vocabulary</div>
          <div class="stat-value">${vs.mastered}<span class="small muted" style="font-size:var(--fs-sm)"> / 300</span></div>
          <div class="stat-sub">${vs.learning + vs.known} in progress</div>
        </div>
        <div class="stat">
          <div class="stat-label">${UI.esc(lvl.name)}</div>
          <div class="stat-value">${store.data.progress.xp}<span class="small muted" style="font-size:var(--fs-sm)"> XP</span></div>
          <div class="pace-track" style="height:4px;margin-top:6px"><div class="pace-fill" style="width:${lvl.progress}%"></div></div>
        </div>
        <div class="stat">
          <div class="stat-label">Total time</div>
          <div class="stat-value">${Math.floor(store.data.progress.totalMinutes / 60)}h</div>
          <div class="stat-sub">${store.data.progress.totalMinutes % 60}m this course</div>
        </div>
      </div>

      ${phases}`;
  },

  weekCard(w) {
    const pct = store.weekPercent(w.week);
    const wp = store.getWeekProgress(w.week);
    const unlocked = store.isWeekUnlocked(w.week);
    const isCurrent = w.week === store.data.progress.currentWeek && wp.status !== "completed";
    const sessions = ["grammar", "listening", "writing", "review"];

    return `
      <button class="week-card ${wp.status === "completed" ? "is-complete" : ""} ${isCurrent ? "is-current" : ""}"
              ${unlocked ? `onclick="UI.go('week/${w.week}')"` : "disabled"}>
        <div class="week-card-top">
          <span class="week-num">Semaine ${w.week}</span>
          ${wp.status === "completed" ? `<span class="week-badge badge-done">✓ ${Math.round(pct)}%</span>`
            : isCurrent ? `<span class="week-badge badge-current">En cours</span>`
            : unlocked ? "" : `<span class="muted small">🔒</span>`}
        </div>
        <div>
          <div class="week-title">${UI.esc(w.title.split("—")[0].trim())}</div>
          <div class="week-theme">${UI.esc(w.theme)}</div>
        </div>
        <div class="dots">
          ${sessions.map((s) => `<span class="dot ${wp.sessions[s]?.completed ? "on" : ""}"></span>`).join("")}
        </div>
      </button>`;
  },

  /* ============================================================
     Week detail
     ============================================================ */

  week(n) {
    const w = CourseData.getWeek(n);
    if (!w) return UI.go("dashboard");
    const wp = store.getWeekProgress(n);
    const refs = CourseData.grammarForWeek(n);

    this.root.innerHTML = `
      <button class="btn-back" onclick="UI.go('dashboard')">← Dashboard</button>
      <div class="week-hero">
        <div class="eyebrow">Phase ${w.phase} · Semaine ${n} of 12</div>
        <h1>${UI.esc(w.title)}</h1>
        <div class="grammar-note"><strong>Grammar focus —</strong> ${UI.esc(w.grammarPoint)}</div>
      </div>

      <div class="section-head"><h2>Sessions</h2><span class="section-sub">≈1 hour each</span></div>
      <div class="session-list">
        ${Object.entries(SESSIONS).map(([key, meta]) => {
          const s = wp.sessions[key];
          const unfinished = !s?.completed && store.hasUnfinished(n, key);
          return `
            <button class="session-card ${s?.completed ? "done" : ""} ${unfinished ? "resumable" : ""}" onclick="UI.go('session/${n}/${key}')">
              <div class="session-ico">${meta.icon}</div>
              <div class="session-body">
                <div class="session-day">${meta.day}</div>
                <div class="session-name">${meta.name}</div>
                <div class="session-desc">${unfinished ? "In progress — picks up where you stopped" : meta.desc}</div>
              </div>
              <div class="session-end">
                ${s?.completed ? `<span class="score-chip">${s.score}%</span>`
                  : unfinished ? `<span class="score-chip resume-chip">Resume</span>` : ""}
                <span class="chev">→</span>
              </div>
            </button>`;
        }).join("")}
      </div>

      ${refs.length ? `
        <div class="section-head"><h2>Grammar reference</h2><span class="section-sub">Consult any time</span></div>
        ${refs.map((e) => UI.grammarCard(e)).join("")}` : ""}

      <div class="section-head"><h2>Vocabulary this week</h2><span class="section-sub">${w.vocab.length} words</span></div>
      <div class="vocab-table">
        ${w.vocab.map((v) => {
          const e = store.getVocabEntry(v.id);
          return `
            <div class="vrow">
              <div class="vterm">${UI.esc(v.word)}<button class="speak speak-sm" data-say="${UI.esc(v.word)}">🔊</button></div>
              <div class="vtrans">${UI.esc(v.translation)}</div>
              <div class="vlevel lv-${e.level}">${e.level}</div>
            </div>`;
        }).join("")}
      </div>`;

    Speech.bind(this.root);
  },

  /* ============================================================
     Session runner
     ============================================================ */

  session(n, type) {
    const w = CourseData.getWeek(n);
    if (!w || !SESSIONS[type]) return UI.go("dashboard");

    const resuming = store.hasUnfinished(n, type);

    this.root.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <button class="btn-back" onclick="UI.go('week/${n}')">← Semaine ${n}</button>
        <button class="btn-back" id="sess-restart" title="Discard progress in this session and begin again">↺ Start over</button>
      </div>
      <div class="ex-shell"><div id="stage"></div></div>`;

    document.getElementById("sess-restart").onclick = () => {
      if (confirm("Start this session over from the beginning?")) Runner.restart();
    };

    const stage = document.getElementById("stage");

    // Stage lists. Screens and question sets are separate stages so a
    // refresh during the questions does not replay the video or passage.
    const chains = {
      grammar: [
        { kind: "items",
          build: () => Flashcards.items(CourseData.reviewPool(n)),
          render: (h, item, done) => Flashcards.renderCard(h, item, done) },
        { kind: "items",
          build: () => w.grammar,
          render: (h, ex, done) => Exercises.renderItem(h, ex, done) }
      ],
      listening: [
        { kind: "screen", render: (h, done) => Listening.renderMedia(h, w, w.listening, done) },
        { kind: "items",
          build: () => w.listening.questions,
          render: (h, q, done) => Exercises.renderItem(h, q, done) },
        { kind: "screen", render: (h, done) => Reading.renderPassage(h, w.reading, done) },
        { kind: "items",
          build: () => w.reading.questions,
          render: (h, q, done) => Exercises.renderItem(h, q, done) }
      ],
      writing: [
        { kind: "items",
          build: () => CourseData.translationsFor(n),
          render: (h, t, done) => Translation.renderItem(h, t, done) },
        { kind: "custom",
          render: (h, cp, done, save) => Composition.render(h, cp, done, save) }
      ],
      review: [
        { kind: "items",
          build: () => {
            const due = store.getDueVocab(CourseData.weekVocabIds(n));
            return Flashcards.items(due.length ? due : CourseData.weekVocabIds(n).slice(0, 10));
          },
          render: (h, item, done) => Flashcards.renderCard(h, item, done) },
        { kind: "items",
          build: () => Quiz.weekly(n),
          render: (h, q, done) => Exercises.renderItem(h, q, done),
          onScore: (s) => store.recordQuizScore(n, s) }
      ]
    };

    const stages = chains[type];

    Runner.start(stage, {
      week: n, type, stages,
      onFinish: (score, minutes) => {
        if (type === "review") store.recordQuizScore(n, score);
        store.completeSession(n, type, score);
        store.recordActivity(minutes, [`${type}_w${n}`]);
        UI.toast(`${SESSIONS[type].name} — ${score}%`, score >= 60 ? "ok" : "warn");
        UI.go(`week/${n}`);
      }
    });

    if (resuming) document.getElementById("sess-restart").classList.add("is-visible");
  },

  /* ============================================================
     Phase exam
     ============================================================ */

  exam(phase) {
    this.root.innerHTML = `
      <button class="btn-back" onclick="UI.go('dashboard')">← Dashboard</button>
      <div class="ex-shell">
        <div class="card card-pad" id="exam-intro">
          <div class="eyebrow">Phase ${phase} examination</div>
          <h1 style="margin:var(--s2) 0">${PHASES[phase].name}</h1>
          <p class="muted">40 questions drawn from weeks ${PHASES[phase].weeks} — vocabulary, grammar, reading and translation. You need <strong>65%</strong> to pass. Unlike the weekly quizzes, answers are not revealed until the end.</p>
          <button class="btn btn-primary btn-lg" id="exam-start" style="margin-top:var(--s4)">Begin exam →</button>
        </div>
        <div id="stage"></div>
      </div>`;

    const begin = () => {
      const intro = document.getElementById("exam-intro");
      if (intro) intro.remove();
      Runner.start(document.getElementById("stage"), {
        week: `exam${phase}`, type: "exam",
        stages: [Quiz.examStage(phase, `Phase ${phase} — ${PHASES[phase].name}`)],
        onFinish: (score, minutes) => {
          store.recordPhaseExam(phase, score);
          store.recordActivity(minutes, [`exam_p${phase}`]);
          UI.go("dashboard");
        }
      });
    };

    // An exam already underway resumes straight into the questions.
    if (store.hasUnfinished(`exam${phase}`, "exam")) begin();
    else document.getElementById("exam-start").onclick = begin;
  },

  /* ============================================================
     Vocabulary
     ============================================================ */

  vocabulary() {
    const all = CourseData.allVocab();
    const vs = store.vocabStats();

    this.root.innerHTML = `
      <div class="section-head">
        <div>
          <h1>Vocabulaire</h1>
          <div class="section-sub">${all.length} words across 12 weeks</div>
        </div>
      </div>

      <div class="stats" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat"><div class="stat-label">Mastered</div><div class="stat-value">${vs.mastered}</div></div>
        <div class="stat"><div class="stat-label">Known</div><div class="stat-value">${vs.known}</div></div>
        <div class="stat"><div class="stat-label">Learning</div><div class="stat-value">${vs.learning}</div></div>
        <div class="stat"><div class="stat-label">Untouched</div><div class="stat-value">${all.length - vs.total}</div></div>
      </div>

      <div class="vocab-toolbar">
        <input class="search" id="vq" placeholder="Search French or English…" autocomplete="off">
        <div class="filters" id="vf">
          <button class="filter on" data-f="all">All</button>
          <button class="filter" data-f="new">New</button>
          <button class="filter" data-f="learning">Learning</button>
          <button class="filter" data-f="known">Known</button>
          <button class="filter" data-f="mastered">Mastered</button>
        </div>
      </div>
      <div class="vocab-table" id="vlist"></div>`;

    const list = document.getElementById("vlist");
    let query = "", filter = "all";

    const draw = () => {
      const rows = all.filter((v) => {
        const e = store.getVocabEntry(v.id);
        if (filter !== "all" && e.level !== filter) return false;
        if (!query) return true;
        return (v.word + " " + v.translation).toLowerCase().includes(query);
      });

      list.innerHTML = rows.length
        ? rows.map((v) => {
            const e = store.getVocabEntry(v.id);
            const wk = v.id.slice(1, 3);
            return `
              <div class="vrow">
                <div class="vterm">${UI.esc(v.word)}<button class="speak speak-sm" data-say="${UI.esc(v.word)}">🔊</button></div>
                <div class="vtrans">${UI.esc(v.translation)} <span class="muted">· S${+wk}</span></div>
                <div class="vlevel lv-${e.level}">${e.level}</div>
              </div>`;
          }).join("")
        : `<div class="empty"><div class="empty-ico">🔍</div><p>No words match.</p></div>`;
      Speech.bind(list);
    };

    document.getElementById("vq").addEventListener("input", (e) => {
      query = e.target.value.toLowerCase().trim();
      draw();
    });
    document.getElementById("vf").addEventListener("click", (e) => {
      const b = e.target.closest(".filter");
      if (!b) return;
      document.querySelectorAll("#vf .filter").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      filter = b.dataset.f;
      draw();
    });

    draw();
  },

  /* ============================================================
     Grammar reference
     ============================================================ */

  grammar() {
    const entries = CourseData.grammarRef.entries;
    const current = store.data.progress.currentWeek;

    this.root.innerHTML = `
      <div class="section-head">
        <div>
          <h1>Grammaire</h1>
          <div class="section-sub">${entries.length} reference cards · conjugation tables and the mistakes to avoid</div>
        </div>
      </div>
      <input class="search" id="gq" placeholder="Search grammar topics…" style="margin-bottom:var(--s5)">
      <div id="glist">
        ${[1, 2, 3].map((p) => {
          const inPhase = entries.filter((e) => {
            const w = CourseData.getWeek(e.week);
            return w && w.phase === p;
          });
          if (!inPhase.length) return "";
          return `
            <div class="g-group">
              <div class="section-head"><h2>Phase ${p} — ${PHASES[p].name}</h2></div>
              ${inPhase.map((e) => UI.grammarCard(e, e.week === current)).join("")}
            </div>`;
        }).join("")}
      </div>`;

    document.getElementById("gq").addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll("#glist .accordion").forEach((acc) => {
        const hit = acc.textContent.toLowerCase().includes(q);
        acc.style.display = hit ? "" : "none";
        if (q && hit) acc.open = true;
      });
      document.querySelectorAll(".g-group").forEach((g) => {
        const any = [...g.querySelectorAll(".accordion")].some((a) => a.style.display !== "none");
        g.style.display = any ? "" : "none";
      });
    });
  },

  /* ============================================================
     Profile
     ============================================================ */

  profile() {
    const lvl = store.getLevel();
    const p = store.pace();
    const s = store.settings;

    this.root.innerHTML = `
      <div class="section-head"><h1>Profil</h1></div>

      <div class="card card-pad" style="margin-bottom:var(--s6)">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:var(--s4)">
          <div>
            <div class="eyebrow">Current level</div>
            <div style="font-size:var(--fs-2xl);font-weight:680;letter-spacing:-.03em">${UI.esc(lvl.name)}</div>
            <div class="small muted">${store.data.progress.xp} XP${lvl.next ? ` · ${lvl.next - store.data.progress.xp} to ${lvl.next === 500 ? "Explorateur" : "next tier"}` : ""}</div>
          </div>
          <div style="text-align:right">
            <div class="eyebrow">Course target</div>
            <div style="font-size:var(--fs-lg);font-weight:650">A2 by 31 Dec 2026</div>
            <span class="status-pill status-${p.status}">${p.label}</span>
          </div>
        </div>
        <div class="pace-track" style="margin-top:var(--s5)"><div class="pace-fill" style="width:${lvl.progress}%"></div></div>
      </div>

      <div class="section-head"><h2>Sync</h2></div>
      <div class="card card-pad" style="margin-bottom:var(--s6)">
        <div class="setting" style="border:none;padding:0">
          <div>
            <div class="setting-label">${
              !Sync.available ? "Local only"
              : Sync.state === "signed-out" ? "Not signed in"
              : "Signed in"
            }</div>
            <div class="setting-desc">${
              !Sync.available ? "Set APP_PASSWORD on the server to enable cross-device sync."
              : Sync.state === "signed-out" ? "Sign in with your password to carry progress between devices."
              : Sync.persistent ? "Progress syncs automatically across your devices."
              : "Syncing, but no volume is attached — progress resets on redeploy."
            }</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="App.syncModal()">${
            !Sync.available ? "Set up" : Sync.state === "signed-out" ? "Sign in" : "Manage"
          }</button>
        </div>
      </div>

      <div class="section-head"><h2>Achievements</h2></div>
      <div class="ach-grid" style="margin-bottom:var(--s6)">
        ${Object.entries(ACHIEVEMENTS).map(([id, a]) => {
          const on = store.hasAchievement(id);
          return `
            <div class="ach ${on ? "on" : "off"}" title="${UI.esc(a.hint)}">
              <div class="ach-ico">${a.icon}</div>
              <div class="ach-name">${UI.esc(a.name)}</div>
            </div>`;
        }).join("")}
      </div>

      <div class="section-head"><h2>Settings</h2></div>
      <div class="card card-pad">
        <div class="setting">
          <div><div class="setting-label">Dark mode</div><div class="setting-desc">Stays on this device</div></div>
          <label class="switch"><input type="checkbox" id="s-dark" ${s.darkMode ? "checked" : ""}><span></span></label>
        </div>
        <div class="setting">
          <div><div class="setting-label">Speak answers automatically</div><div class="setting-desc">Plays the French when a flashcard flips</div></div>
          <label class="switch"><input type="checkbox" id="s-auto" ${s.autoSpeak ? "checked" : ""}><span></span></label>
        </div>
        <div class="setting">
          <div><div class="setting-label">Voice speed</div><div class="setting-desc">${s.speechRate.toFixed(2)}× — slower helps early on</div></div>
          <div class="row">
            <input type="range" id="s-rate" min="0.5" max="1.2" step="0.05" value="${s.speechRate}">
            <button class="speak speak-sm" data-say="Bonjour, je travaille dans le support technique.">🔊</button>
          </div>
        </div>
        <div class="setting">
          <div><div class="setting-label">Reset progress</div><div class="setting-desc">Clears this device${Sync.available && Sync.state !== "signed-out" ? " and the synced copy on the server" : ""}</div></div>
          <button class="btn btn-danger btn-sm" id="s-reset">Reset</button>
        </div>
      </div>`;

    Speech.bind(this.root);

    document.getElementById("s-dark").onchange = (e) => {
      store.setSetting("darkMode", e.target.checked);
      this.applyTheme();
    };
    document.getElementById("s-auto").onchange = (e) =>
      store.setSetting("autoSpeak", e.target.checked);
    document.getElementById("s-rate").oninput = (e) => {
      store.setSetting("speechRate", parseFloat(e.target.value));
      e.target.closest(".setting").querySelector(".setting-desc").textContent =
        `${parseFloat(e.target.value).toFixed(2)}× — slower helps early on`;
    };
    document.getElementById("s-reset").onclick = () => {
      if (confirm("Reset all progress? This cannot be undone.")) {
        store.reset();
        UI.toast("Progress reset");
        UI.go("dashboard");
      }
    };
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
