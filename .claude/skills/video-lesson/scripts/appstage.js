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

const CARD_FADE_MS = 300;

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
  }

  // Page coordinates → the finished video's pixels (the window sits in `box`).
  outPoint(p) {
    return { x: this.box.x + (p.x * this.box.w) / this.origin.w, y: this.box.y + (p.y * this.box.h) / this.origin.h };
  }

  // Push the picture in on `sel` (compose.js does the actual zoom); 1.6–2 reads
  // well for a button or a sidebar row. Stays until zoomOut.
  async zoom(sel, opts = {}) {
    const o = this.outPoint(await this.point(sel, opts.at));
    await this.recordZoom(opts.scale ?? 1.8, o.x, o.y, opts);
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

  async click(sel, opts = {}) {
    const pause = opts.pause ?? 160;
    const p = await this.moveTo(sel, { ...opts, pause });
    await sleep(pause);
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
    this.log(`click ${sel}`);
    await sleep(opts.settle ?? 350);
    return p;
  }

  async type(text, opts = {}) {
    for (const ch of text) {
      if (this.mouse === "real") execFileSync("cliclick", [`t:${ch}`]);
      else await this.control.evaluate((c) => window.__lc.typeText(c), ch);
      await sleep(ch === " " ? 40 : 55 + Math.random() * 45);
    }
    if (opts.after) await sleep(opts.after);
  }

  // Enter, Escape, Tab… as the app's own key handling sees them.
  async press(key) {
    if (this.mouse === "real") {
      const names = { Enter: "return", Escape: "esc", Tab: "tab", ArrowDown: "arrow-down", ArrowUp: "arrow-up", Backspace: "delete", " ": "space" };
      execFileSync("cliclick", [`kp:${names[key] || key.toLowerCase()}`]);
    } else {
      await this.control.evaluate((k) => window.__lc.pressKey(k), key);
    }
  }

  // A native shortcut such as "cmd+shift+g", through System Events, for the
  // parts of the app that are not web content (the folder picker sheet).
  async keys(combo) {
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

module.exports = { AppStage, CARD_FADE_MS };
