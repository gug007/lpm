// The beat API for a vertical take: everything a lesson beat can call,
// plus the calls a short-form edit needs. The camera, stickers, jump cuts and
// the cold open are not drawn during the take; they are written to the
// timeline and cut together at mux time (render.js).
const shared = require("./shared");
const { AppStage } = shared("appstage");
const { sleep } = shared("words");
const { clampScale } = shared("keyframes");
const { keyCaps, isShortcut } = require("./keycaps");
const { LATE_MS } = require("./moves");

class TikTokStage extends AppStage {
  constructor(app, capture, opts = {}) {
    super(app, capture, opts);
    const { narration = [], open = 1 } = opts.lesson || {};
    // The opening lines' beats are never seen, so a late cue there is no mistake.
    this.unseen = new Set(narration.slice(0, open).map((l) => l.id));
    this.moves = [];
    this.labels = [];
    this.cuts = [];
    this.presses = [];
    this.actedMs = 0;
    this.payoffMs = null;
  }

  static async open(app, capture, opts = {}) {
    const stage = new TikTokStage(app, capture, opts);
    await stage.install();
    return stage;
  }

  now() {
    return Date.now() - this.t0;
  }

  // Waits until an action `leadMs` long has to start to finish on the cue. When
  // that moment has passed the action lands late, which only shows in the
  // finished video, so it is reported.
  async holdForCue(text, leadMs) {
    const at = this.cueMs(text) - leadMs;
    const late = Date.now() - (this.lineStart + at);
    if (late > LATE_MS) {
      const note = `"${text}" lands ${(late / 1000).toFixed(1)} s late: the steps before it ran past the word, so start them sooner or add words before it`;
      if (!this.line.words?.length) this.log(`${note} (estimated timing)`);
      else if (this.unseen.has(this.line.id)) this.log(`${note} (opening, never seen)`);
      else this.warn("cue", note);
    }
    await this.holdUntil(at);
  }

  // A re-glide the stage makes on its own (a click whose target shifted).
  async glideTo(x, y, ms) {
    this.moves.push({ startMs: this.now(), ms: Math.max(ms, 150), x, y });
    await super.glideTo(x, y, ms);
  }

  // AppStage.moveTo, with every move on the timeline so the camera can follow
  // the pointer out of a push-in.
  async moveTo(sel, opts = {}) {
    const p = await this.point(sel, opts.at);
    const ms = opts.ms ?? 600;
    if (opts.cue) await this.holdForCue(opts.cue, ms + (opts.pause ?? 0));
    this.moves.push({ startMs: this.now(), ms, x: p.x, y: p.y });
    await this.control.evaluate((x, y, ms) => window.__lc.moveTo(x, y, ms), p.x, p.y, ms);
    this.pointer = p;
    if (this.mouse === "real") this.realMove(p.x, p.y);
    else await this.control.evaluate((x, y) => window.__lc.hover(x, y), p.x, p.y);
    if (opts.after) await sleep(opts.after);
    return p;
  }

  async pressAt(p) {
    await super.pressAt(p);
    this.actedMs = this.now();
  }

  // Push the camera in on `sel`: `scale` 1 is the wide shot (the whole window
  // width), 1.6–2.2 reads a button, a row or a terminal line on a phone. The
  // target lands a little above the middle of the frame, clear of the captions.
  async focus(sel, opts = {}) {
    const p = await this.point(sel, opts.at);
    await this.camera(opts.scale ?? 1.8, p, { ...opts, sel });
  }

  // Back to the wide shot, centred on the window.
  async wide(opts = {}) {
    await this.camera(1, null, opts);
  }

  zoom(sel, opts) {
    return this.focus(sel, opts);
  }

  zoomOut(opts) {
    return this.wide(opts);
  }

  // `opts.sel` (with `opts.at`) names what the move aims at, for lesson.json
  // "zooms". A move whose cue has already gone by is put on it at mux time
  // (moves.js), but never before the click or glide it came after (`notBefore`).
  async camera(scale, p, opts) {
    const ms = opts.ms ?? 550;
    const cue = opts.cue ? this.cueMs(opts.cue) : null;
    const glide = this.moves.at(-1);
    const notBefore = Math.max(this.actedMs, glide ? glide.startMs + 1 : 0);
    if (cue != null) await this.holdUntil(cue - ms);
    const rect = p && opts.sel ? await this.control.evaluate((q) => window.__lc.rect(q), opts.sel) : null;
    const s = clampScale(scale);
    this.zooms.push({
      id: this.zoomId(),
      startMs: this.now(),
      ms,
      scale: s,
      x: p ? p.x : null,
      y: p ? p.y : null,
      ...(cue != null && { cueMs: Math.round(this.lineStart - this.t0 + cue), notBefore }),
      ...(rect && { sel: opts.sel, at: opts.at || [0.5, 0.5], rect }),
    });
    this.log(p ? `camera ${s}x on ${Math.round(p.x)},${Math.round(p.y)} over ${ms}ms` : `camera wide over ${ms}ms`);
  }

  // A shortcut's keys show as a badge for a moment (keycaps.js); `badge` shows
  // any other key, or hides a shortcut's. `cue` presses on that word.
  async keys(combo, opts = {}) {
    await this.notePress(combo, opts);
    await super.keys(combo);
  }

  async press(key, opts = {}) {
    await this.notePress(key, opts);
    await super.press(key);
  }

  async notePress(combo, { cue, badge = isShortcut(combo) } = {}) {
    if (cue) await this.holdForCue(cue, 0);
    if (badge) this.presses.push({ startMs: this.now(), caps: keyCaps(combo) });
  }

  // The step sticker at the top of the frame, from the cue word (or now) until
  // the next label; `null` clears it. A line's `label` in lesson.json does the
  // same at the start of that line. `plain` leaves the step number off, and a
  // plain label that follows another changes in place (a running clock).
  async label(text, opts = {}) {
    if (opts.cue) await this.holdUntil(this.cueMs(opts.cue));
    this.labels.push({ startMs: this.now(), text, plain: !!opts.plain });
    this.log(text ? `label "${text}"` : "label cleared");
  }

  // Marks the result shot the video opens on: the take from here, for as long
  // as the hook line runs, plays first under the hook. Hold the shot that long.
  async payoff(opts = {}) {
    if (opts.cue) await this.holdUntil(this.cueMs(opts.cue));
    this.payoffMs = this.now();
    this.log("payoff");
  }

  // A jump cut over waiting: `work` starts at once (typing, an agent
  // thinking); once this line's narration has finished (plus `keepMs`),
  // everything until `work` is done is cut from the video.
  async skip(work, opts = {}) {
    const done = Promise.resolve().then(work);
    await this.holdUntil(this.line.ms + (opts.keepMs ?? 250));
    const fromMs = this.now();
    const result = await done;
    const toMs = this.now();
    if (toMs - fromMs > 120) {
      this.cuts.push({ fromMs, toMs });
      this.log(`jump cut ${((toMs - fromMs) / 1000).toFixed(1)}s`);
    }
    return result;
  }

  async card() {
    throw new Error("a vertical lesson has no topic cards; use s.label() for on-screen text");
  }

  timelineExtras() {
    return {
      pointer: this.moves,
      labels: this.labels,
      cuts: this.cuts,
      presses: this.presses,
      payoffMs: this.payoffMs,
      origin: { w: this.origin.w, h: this.origin.h, scale: this.origin.scale },
    };
  }
}

module.exports = { TikTokStage };
