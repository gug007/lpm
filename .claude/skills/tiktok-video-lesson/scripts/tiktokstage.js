// The beat API for a vertical take: everything a video-lesson beat can call,
// plus the calls a short-form edit needs. The camera, stickers, jump cuts and
// the cold open are not drawn during the take; they are written to the
// timeline and cut together at mux time (make.js).
const shared = require("./shared");
const { AppStage } = shared("appstage");
const { sleep } = shared("words");

class TikTokStage extends AppStage {
  constructor(app, capture, opts = {}) {
    super(app, capture, opts);
    this.pointer = [];
    this.labels = [];
    this.cuts = [];
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

  // AppStage.moveTo, with every move on the timeline so the camera can follow
  // the pointer out of a push-in.
  async moveTo(sel, opts = {}) {
    const p = await this.point(sel, opts.at);
    const ms = opts.ms ?? 600;
    if (opts.cue) await this.holdUntil(this.cueMs(opts.cue) - ms - (opts.pause ?? 0));
    this.pointer.push({ startMs: this.now(), ms, x: p.x, y: p.y });
    await this.control.evaluate((x, y, ms) => window.__lc.moveTo(x, y, ms), p.x, p.y, ms);
    if (this.mouse === "real") this.realMove(p.x, p.y);
    else await this.control.evaluate((x, y) => window.__lc.hover(x, y), p.x, p.y);
    if (opts.after) await sleep(opts.after);
    return p;
  }

  // Push the camera in on `sel`: `scale` 1 is the wide shot (the whole window
  // width), 1.6–2.2 reads a button, a row or a terminal line on a phone. The
  // target lands a little above the middle of the frame, clear of the captions.
  async focus(sel, opts = {}) {
    const p = await this.point(sel, opts.at);
    await this.camera(opts.scale ?? 1.8, p, opts);
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

  async camera(scale, p, opts) {
    const ms = opts.ms ?? 550;
    if (opts.cue) await this.holdUntil(this.cueMs(opts.cue) - ms);
    const s = Math.min(3, Math.max(1, scale));
    this.zooms.push({ startMs: this.now(), ms, scale: s, x: p ? p.x : null, y: p ? p.y : null });
    this.log(p ? `camera ${s}x on ${Math.round(p.x)},${Math.round(p.y)} over ${ms}ms` : `camera wide over ${ms}ms`);
  }

  // The step sticker at the top of the frame, from the cue word (or now) until
  // the next label; `null` clears it. A line's `label` in lesson.json does the
  // same at the start of that line.
  async label(text, opts = {}) {
    if (opts.cue) await this.holdUntil(this.cueMs(opts.cue));
    this.labels.push({ startMs: this.now(), text });
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
      pointer: this.pointer,
      labels: this.labels,
      cuts: this.cuts,
      payoffMs: this.payoffMs,
      origin: { w: this.origin.w, h: this.origin.h, scale: this.origin.scale },
    };
  }
}

module.exports = { TikTokStage };
