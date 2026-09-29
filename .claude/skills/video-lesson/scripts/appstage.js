// The beat API over the real desktop app: the same moveTo/click/type/card calls
// a demo beat makes, carried out through the app's lesson control socket. The
// cursor is drawn inside the app's own page; the real pointer (never captured)
// clicks through cliclick when macOS lets it, else events are dispatched in the
// page. Topic cards are not painted here — they are recorded on the timeline
// and composited over the video afterwards (compose.js).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { sleep, Timing } = require("./words");
const { OVERLAY_CSS, CURSOR_SVG, HOTSPOT, installStage } = require("./overlay");
const { claudeTurn } = require("./agents");

const CARD_FADE_MS = 300;
// The opening card hands over to the app in one move: its words lift away over
// `titleMs` from `titleLeadMs` before the card's end, so they are gone before
// the window shows through; from `leadMs` before the end the card fades over
// `fadeMs` (its clip runs on past the end to cover it) while the window rises
// `rise` of its height over `riseMs`.
const OPEN_LIFT = { titleLeadMs: 500, titleMs: 450, leadMs: 300, fadeMs: 700, riseMs: 900, rise: 0.45 };

function realMouseWorks() {
  try {
    const before = execFileSync("cliclick", ["p"], { encoding: "utf8" }).trim();
    const probe = "m:20,20";
    const after = execFileSync("cliclick", [probe, "p"], { encoding: "utf8" }).trim();
    execFileSync("cliclick", [`m:${before.replace(/\s/g, "")}`], { encoding: "utf8" });
    return after.replace(/\s/g, "") === "20,20";
  } catch {
    return false;
  }
}

class AppStage extends Timing {
  constructor(app, capture, opts = {}) {
    super(opts);
    this.app = app;
    this.control = app.control;
    this.capture = capture;
    this.framesDir = opts.framesDir;
    this.frameNo = 0;
    this.cards = [];
    this.covered = false;
    this.mouse = opts.mouse;
    this.origin = opts.origin;
    this.box = opts.box;
    this.out = opts.out;
    this.zooms = [];
    this.warnings = [];
  }

  // Something the take got through but a reviewer should know about; saved
  // with the timeline and listed after the mux.
  warn(kind, message) {
    this.warnings.push({ kind, line: this.line?.id || null, atMs: this.t0 ? Date.now() - this.t0 : 0, message });
    this.log(`warning: ${message}`);
  }

  // Page coordinates → the finished video's pixels (the window sits in `box`).
  outPoint(p) {
    return { x: this.box.x + (p.x * this.box.w) / this.origin.w, y: this.box.y + (p.y * this.box.h) / this.origin.h };
  }

  // Push the picture in on `sel` (compose.js does the actual zoom); 1.6–2 reads
  // well for a button or a sidebar row. Stays until zoomOut.
  async zoom(sel, opts = {}) {
    await this.waitFor(sel);
    const r = await this.control.evaluate((s) => window.__lc.rect(s), sel);
    const at = opts.at || [0.5, 0.5];
    const o = this.outPoint({ x: r.x + r.w * at[0], y: r.y + r.h * at[1] });
    const tl = this.outPoint(r);
    const br = this.outPoint({ x: r.x + r.w, y: r.y + r.h });
    const rect = { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
    await this.recordZoom(opts.scale ?? 1.8, o.x, o.y, opts, { sel, at, rect });
  }

  async zoomOut(opts = {}) {
    await this.recordZoom(1, this.out.width / 2, this.out.height / 2, opts);
  }

  static async open(app, capture, opts = {}) {
    const stage = new AppStage(app, capture, opts);
    await stage.install();
    return stage;
  }

  async install() {
    const scale = this.origin.scale;
    await this.control.evaluate(
      (css, fn, args) => {
        if (window.__lc) return;
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
        new Function("return " + fn)()(args);
      },
      OVERLAY_CSS,
      installStage.toString(),
      { cursorSvg: CURSOR_SVG, hotspot: HOTSPOT, hiddenText: [], scale },
    );
    const start = { x: this.origin.w * 0.56, y: this.origin.h * 0.52 };
    await this.control.evaluate((x, y) => window.__lc.place(x, y), start.x, start.y);
    if (this.mouse === "real" && !realMouseWorks()) {
      this.log("real pointer unavailable (grant Accessibility to the terminal); dispatching events in the page");
      this.mouse = "dom";
    }
    if (this.mouse === "real") {
      this.pointerBefore = execFileSync("cliclick", ["p"], { encoding: "utf8" }).trim().replace(/\s/g, "");
      this.realMove(start.x, start.y);
    }
  }

  // Hands the pointer back where the person left it.
  finish() {
    if (this.pointerBefore) execFileSync("cliclick", [`m:${this.pointerBefore}`]);
  }

  screen(x, y) {
    return { x: Math.round(this.origin.x + x), y: Math.round(this.origin.y + y) };
  }

  // A real click maps page coordinates onto the screen, so the window has to be
  // where it was when the capture started — anything else would land the click
  // outside the recording.
  async refreshOrigin() {
    const b = await this.control.call("bounds");
    const now = { x: b.x / b.scale, y: b.y / b.scale, w: b.w / b.scale, h: b.h / b.scale, scale: b.scale };
    const moved = ["x", "y", "w", "h"].some((k) => Math.abs(now[k] - this.origin[k]) > 1);
    if (moved) throw new Error(`the app window moved during the recording (${JSON.stringify(now)}); the take is unusable`);
  }

  realMove(x, y) {
    const p = this.screen(x, y);
    execFileSync("cliclick", [`m:${p.x},${p.y}`]);
  }

  async waitFor(sel, timeout = 8000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      if (await this.control.evaluate((s) => window.__lc.find(s), sel)) return;
      await sleep(80);
    }
    throw new Error(`waitFor: "${sel}" never became visible`);
  }

  async point(sel, at = [0.5, 0.5]) {
    await this.waitFor(sel);
    const r = await this.control.evaluate((s) => window.__lc.rect(s), sel);
    return { x: r.x + r.w * at[0], y: r.y + r.h * at[1] };
  }

  async moveTo(sel, opts = {}) {
    const p = await this.point(sel, opts.at);
    const ms = opts.ms ?? 750;
    if (opts.cue) await this.holdUntil(this.cueMs(opts.cue) - ms - (opts.pause ?? 0));
    await this.control.evaluate((x, y, ms) => window.__lc.moveTo(x, y, ms), p.x, p.y, ms);
    if (this.mouse === "real") this.realMove(p.x, p.y);
    else await this.control.evaluate((x, y) => window.__lc.hover(x, y), p.x, p.y);
    if (opts.after) await sleep(opts.after);
    return p;
  }

  // `verify` (a selector that must show up, or an async check) makes the
  // click check itself: while the target is still there it is pressed again,
  // twice at most, then the take stops; a target that has gone means the
  // click worked and the page is only slow, so it waits on `verify` instead.
  async click(sel, opts = {}) {
    const pause = opts.pause ?? 160;
    let p = await this.moveTo(sel, { ...opts, pause });
    await sleep(pause);
    p = await this.settledPoint(sel, opts.at, p);
    await this.pressAt(p);
    this.log(`click ${sel}`);
    await sleep(opts.settle ?? 350);
    if (!opts.verify) return p;
    const done = typeof opts.verify === "function" ? opts.verify : () => this.control.evaluate((q) => window.__lc.find(q), opts.verify);
    const what = typeof opts.verify === "string" ? opts.verify : "its check";
    for (let presses = 1; ; presses++) {
      const end = Date.now() + (opts.verifyMs ?? 1500);
      while (Date.now() < end) {
        if (await done()) return p;
        await sleep(100);
      }
      const still = await this.control.evaluate((q) => window.__lc.find(q), sel);
      if (!still) {
        const late = Date.now() + 6000;
        while (Date.now() < late) {
          if (await done()) return p;
          await sleep(150);
        }
        throw new Error(`click on ${sel}: the target went away but ${what} never showed up`);
      }
      if (presses === 3) throw new Error(`click on ${sel} did not take effect after 3 presses (${what} never passed)`);
      this.warn("click", `click on ${sel} did not take, pressing again`);
      await this.control.call("window", { focus: true }).catch(() => {});
      p = await this.settledPoint(sel, opts.at, p);
      await this.pressAt(p);
    }
  }

  // The target can shift while the pointer glides to it (a badge loads and
  // widens a tab); the press goes where it is now, after a short re-glide.
  async settledPoint(sel, at = [0.5, 0.5], p) {
    const r = await this.control.evaluate((q) => (window.__lc.find(q) ? window.__lc.rect(q) : null), sel).catch(() => null);
    if (!r) return p;
    const now = { x: r.x + r.w * at[0], y: r.y + r.h * at[1] };
    if (Math.hypot(now.x - p.x, now.y - p.y) <= 3) return p;
    this.log(`${sel} moved ${Math.round(now.x - p.x)},${Math.round(now.y - p.y)} px while the pointer travelled; following it`);
    await this.glideTo(now.x, now.y, 150);
    await sleep(170);
    return now;
  }

  // A pointer move with no target of its own (the vertical stage records it
  // for its camera).
  async glideTo(x, y, ms) {
    await this.control.evaluate((x2, y2, ms2) => window.__lc.moveTo(x2, y2, ms2), x, y, ms);
    if (this.mouse === "real") this.realMove(x, y);
  }

  async pressAt(p) {
    await this.control.evaluate(() => window.__lc.tap());
    if (this.mouse === "real") {
      await this.refreshOrigin();
      const s = this.screen(p.x, p.y);
      // One atomic press: a held button with any pointer motion in between
      // starts a text drag in WebKit and the release never arrives as a click.
      execFileSync("cliclick", [`c:${s.x},${s.y}`]);
    } else {
      await this.control.evaluate((x, y) => window.__lc.dispatchClick(x, y), p.x, p.y);
    }
  }

  // Keystrokes go to whichever app is in front; after a focus loss that is
  // usually the terminal the take was started from, where "return" submits.
  // The lesson app is brought back once, else the take stops before typing.
  // Matched by pid: the user's own lpm is also called lpm-desktop.
  async ensureFrontmost() {
    if (this.mouse !== "real") return;
    const front = () => {
      try {
        const out = execFileSync("osascript", ["-e", 'tell application "System Events" to tell (first application process whose frontmost is true) to return (unix id as text) & tab & name'], { encoding: "utf8" });
        const [pid, ...name] = out.trim().split("\t");
        return { pid: Number(pid), name: name.join("\t") };
      } catch (e) {
        throw new Error(`cannot tell which app has keyboard focus, so the take stops before typing (System Events: ${String(e.stderr || e.message).trim().slice(0, 200)})`);
      }
    };
    const first = front();
    if (first.pid === this.app.proc.pid) return;
    await this.control.call("window", { focus: true }).catch(() => {});
    await sleep(300);
    const again = front();
    if (again.pid !== this.app.proc.pid) throw new Error(`the lesson window lost keyboard focus to ${again.name}; stopped before typing into it`);
    this.warn("focus", `keyboard focus had moved to ${first.name}; brought the lesson window back`);
  }


  // `words: true` types a word per keystroke burst, for long text a jump cut hides.
  async type(text, opts = {}) {
    await this.ensureFrontmost();
    const parts = opts.words ? text.match(/\S+\s*|\s+/g) || [] : text;
    for (const part of parts) {
      if (this.mouse === "real") execFileSync("cliclick", [`t:${part}`]);
      else await this.control.evaluate((c) => window.__lc.typeText(c), part);
      await sleep(part === " " ? 40 : 55 + Math.random() * 45);
    }
    if (opts.after) await sleep(opts.after);
  }

  // Enter, Escape, Tab… as the app's own key handling sees them. A cliclick
  // key press (`kp:`) never reaches the page — neither xterm nor the composer
  // saw one — so the real keyboard goes through System Events.
  async press(key) {
    if (this.mouse === "real") {
      const names = { Enter: "return", Escape: "esc", Tab: "tab", ArrowDown: "down", ArrowUp: "up", Backspace: "delete", " ": "space" };
      await this.keys(names[key] || key.toLowerCase());
    } else {
      await this.control.evaluate((k) => window.__lc.pressKey(k), key);
    }
  }

  // Resolves once Claude has answered in `projectRoot`, read from its own
  // transcript: text after `since` (`endOfTurn: true` waits for the end of the
  // turn). `prompt` anchors the answer on that message, so an earlier answer
  // in the same or a forked session never counts; `configDir` is a lesson's
  // own Claude account. On timeout the take goes on, the miss is listed after
  // the mux, and `required: true` stops the take instead.
  async waitForAgentReply(projectRoot, { since = Date.now(), timeout = 25000, prompt, configDir, endOfTurn = false, required = false } = {}) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const turn = claudeTurn(projectRoot, { since, prompt, configDir });
      if (endOfTurn ? turn.done : turn.replied) {
        this.log(endOfTurn ? "agent finished its turn" : "agent replied");
        return true;
      }
      await sleep(250);
    }
    const what = `no agent ${endOfTurn ? "end of turn" : "reply"} in ${projectRoot} within ${(timeout / 1000).toFixed(timeout < 10000 ? 1 : 0)} s`;
    if (required) throw new Error(what);
    this.warn("agent", what);
    return false;
  }

  // A native shortcut such as "cmd+shift+g", through System Events, for the
  // parts of the app that are not web content (the folder picker sheet).
  async keys(combo) {
    await this.ensureFrontmost();
    const parts = combo.toLowerCase().split("+");
    const key = parts.pop();
    const mods = parts.map((m) => ({ cmd: "command down", shift: "shift down", alt: "option down", ctrl: "control down" })[m]).filter(Boolean);
    const using = mods.length ? ` using {${mods.join(", ")}}` : "";
    const codes = { return: 36, enter: 36, esc: 53, escape: 53, tab: 48, space: 49, delete: 51, down: 125, up: 126 };
    const script = codes[key] != null ? `key code ${codes[key]}${using}` : `keystroke "${key}"${using}`;
    execFileSync("osascript", ["-e", `tell application "System Events" to ${script}`]);
    await sleep(120);
  }

  async hideCursor() {
    await this.control.evaluate(() => window.__lc.hideCursor());
  }

  async showCursor() {
    await this.control.evaluate(() => window.__lc.showCursor());
  }

  // Recorded for compose.js; the beat still waits the card's length so the
  // narration and the next action stay in step with the demo stage.
  async card(title, opts = {}) {
    const ms = this.cardMs(opts);
    const startMs = Date.now() - this.t0;
    this.cards.push({ title, startMs, ms, hold: !!opts.hold, first: this.covered });
    this.log(`card "${title}" ${ms}ms${opts.hold ? " held" : ""}`);
    this.covered = true;
    await this.control.evaluate(() => window.__lc.hideCursor());
    await sleep(ms);
    if (!opts.hold) {
      this.covered = false;
      await this.control.evaluate(() => window.__lc.showCursor());
    }
  }

  async cardState() {
    return { cards: this.cards.length, covered: this.covered };
  }

  async cover() {
    this.covered = true;
  }

  async isCovered() {
    return this.covered;
  }

  async reveal() {
    this.covered = false;
  }

  async repaint() {}

  async frame(name) {
    if (!this.framesDir || !this.capture.latest) return;
    const file = path.join(this.framesDir, `${String(this.frameNo++).padStart(2, "0")}-${name}.jpg`);
    fs.writeFileSync(file, this.capture.latest);
  }
}

module.exports = { AppStage, CARD_FADE_MS, OPEN_LIFT };
