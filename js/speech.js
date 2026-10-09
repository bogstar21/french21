/* ============================================================
   French text-to-speech via the Web Speech API.
   Picks a real French voice when the OS has one installed;
   voices load asynchronously in Chrome, hence the retry.
   ============================================================ */

const Speech = {
  _voice: null,
  _ready: false,

  init() {
    if (!("speechSynthesis" in window)) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      if (!voices.length) return;
      this._voice =
        voices.find((v) => v.lang === "fr-FR" && /Thomas|Amelie|Audrey|Marie/i.test(v.name)) ||
        voices.find((v) => v.lang === "fr-FR") ||
        voices.find((v) => v.lang.startsWith("fr")) ||
        null;
      this._ready = true;
    };
    pick();
    speechSynthesis.onvoiceschanged = pick;
  },

  get supported() { return "speechSynthesis" in window; },

  say(text) {
    if (!this.supported || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = store.settings.speechRate || 0.85;
    if (this._voice) u.voice = this._voice;
    speechSynthesis.speak(u);
  },

  /** Wires every [data-say] element inside `root`. */
  bind(root) {
    root.querySelectorAll("[data-say]").forEach((el) => {
      if (el._bound) return;
      el._bound = true;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this.say(el.dataset.say);
      });
    });
  }
};
