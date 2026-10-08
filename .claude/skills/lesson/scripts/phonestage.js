// The beat API with lpm Link beside the app: everything AppStage does on the
// Mac, plus taps, waits and zooms on the phone. Phone elements are found in
// the simulated iPhone's accessibility tree, by label:
//   "Done"                         the element whose label is exactly that
//   { contains: "MacBook Pro" }    a label containing the text
//   { label, type: "Button" }      narrowed by type; `index` picks the nth match
// A tap presses the element at that point (phone.js) and is recorded, so the
// video draws a touch mark where it landed.
const { execFileSync } = require("child_process");
const { AppStage } = require("./appstage");
const { sleep } = require("./words");
const { phonePoint } = require("./phonecompose");

const describeSel = (sel) => (typeof sel === "string" ? `"${sel}"` : JSON.stringify(sel));

function matches(e, sel) {
  const label = e.AXLabel || "";
  if (typeof sel === "string") return label === sel;
  if (sel.label != null && label !== sel.label) return false;
  if (sel.contains != null && !label.includes(sel.contains)) return false;
  if (sel.value != null && !(e.AXValue || "").includes(sel.value)) return false;
  if (sel.type != null && e.type !== sel.type) return false;
  return true;
}

const onScreen = (e, device) => e.frame && e.frame.width > 0 && e.frame.height > 0 && e.frame.y < device.h && e.frame.y + e.frame.height > 0;

class PhoneStage extends AppStage {
  constructor(app, capture, opts = {}) {
    super(app, capture, opts);
    this.phone = opts.phone;
    this.taps = [];
  }

  static async open(app, capture, opts = {}) {
    const stage = new PhoneStage(app, capture, opts);
    await stage.install();
    return stage;
  }

  async phoneElements() {
    return (await this.phone.driver.call({ op: "describe" })).elements;
  }

  async phoneFind(sel) {
    const all = (await this.phoneElements()).filter((e) => e.type !== "Application" && onScreen(e, this.phone.layout.device) && matches(e, sel));
    return all[typeof sel === "object" && sel.index ? sel.index : 0] || null;
  }

  async phoneWaitFor(sel, timeout = 8000) {
    const until = Date.now() + timeout;
    for (;;) {
      const e = await this.phoneFind(sel);
      if (e) return e;
      if (Date.now() > until) throw new Error(`phone: ${describeSel(sel)} never showed up`);
      await sleep(150);
    }
  }

  async phoneGone(sel, timeout = 8000) {
    const until = Date.now() + timeout;
    while (await this.phoneFind(sel)) {
      if (Date.now() > until) throw new Error(`phone: ${describeSel(sel)} never went away`);
      await sleep(150);
    }
  }

  phoneOut(x, y) {
    return phonePoint(this.phone.layout, x, y);
  }

  // Taps `sel` on its cue word (`lead` ms earlier, for a control that answers
  // slowly), at `at` inside it (a switch sits at the right of its row).
  // `tries` (default 2) is how many taps it gets before the take stops. `verify` (a phone selector or an async check) must pass
  // afterwards; while the target is still there it is tapped once more.
  async tap(sel, opts = {}) {
    const at = opts.at || [0.5, 0.5];
    await this.phoneWaitFor(sel, opts.timeout);
    if (opts.cue) await this.holdUntil(this.cueMs(opts.cue) - (opts.lead ?? 0));
    const point = async () => {
      const e = await this.phoneWaitFor(sel, 3000);
      return { x: e.frame.x + e.frame.width * at[0], y: e.frame.y + e.frame.height * at[1], label: e.AXLabel };
    };
    const press = async (p) => {
      this.phone.press(p.x, p.y, this.phone.layout.device, p.label);
      this.taps.push({ atMs: Date.now() - this.t0, ...this.phoneOut(p.x, p.y) });
      this.log(`tap ${describeSel(sel)} at ${Math.round(p.x)},${Math.round(p.y)}`);
    };
    await press(await point());
    await sleep(opts.settle ?? 350);
    if (!opts.verify) return;
    const done = typeof opts.verify === "function" ? opts.verify : async () => !!(await this.phoneFind(opts.verify));
    for (let tries = 1; ; tries++) {
      const end = Date.now() + (opts.verifyMs ?? 4000);
      while (Date.now() < end) {
        if (await done()) return;
        await sleep(150);
      }
      if (tries >= (opts.tries ?? 2) || !(await this.phoneFind(sel))) throw new Error(`tap on ${describeSel(sel)}: ${typeof opts.verify === "string" ? `"${opts.verify}"` : "its check"} never passed`);
      this.warn("tap", `tap on ${describeSel(sel)} did not take, tapping again`);
      await press(await point());
    }
  }

  // Push the picture in on a phone element (see AppStage.zoom), or on
  // `{ point: [x, y] }` in device points for what has no element (a terminal's
  // text).
  async phoneZoom(sel, opts = {}) {
    const e = sel.point ? { frame: { x: sel.point[0], y: sel.point[1], width: 1, height: 1 } } : await this.phoneWaitFor(sel, opts.timeout);
    const at = opts.at || [0.5, 0.5];
    const o = this.phoneOut(e.frame.x + e.frame.width * at[0], e.frame.y + e.frame.height * at[1]);
    const tl = this.phoneOut(e.frame.x, e.frame.y);
    const br = this.phoneOut(e.frame.x + e.frame.width, e.frame.y + e.frame.height);
    await this.recordZoom(opts.scale ?? 1.8, o.x, o.y, opts, { sel: describeSel(sel), at, rect: { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y } });
  }

  timelineExtras() {
    return { taps: this.taps };
  }
}

// Where lpm Link's screen is inside Device Hub's window, in pixels of the
// capture: the light screen stands out of the dark bezel and window around it.
// `win` is the window's rectangle in the capture's pixels; the screen's height
// follows from its width and the device's shape.
function findScreen(jpeg, win, device) {
  const k = 4;
  const w = Math.floor(win.w / k);
  const h = Math.floor(win.h / k);
  const gray = execFileSync("ffmpeg", ["-v", "error", "-i", "pipe:0", "-vf", `crop=${win.w}:${win.h}:${win.x}:${win.y},scale=${w}:${h},format=gray`, "-f", "rawvideo", "pipe:1"], { input: jpeg, maxBuffer: 1 << 26 });
  const bright = (x, y) => gray[y * w + x] > 200;
  const cols = [];
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) n += bright(x, y);
    cols.push(n);
  }
  const rows = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += bright(x, y);
    rows.push(n);
  }
  const span = (counts, min) => {
    const first = counts.findIndex((n) => n >= min);
    let last = counts.length - 1;
    while (last > first && counts[last] < min) last--;
    return first < 0 ? null : [first, last + 1];
  };
  const xs = span(cols, h * 0.3);
  const ys = span(rows, w * 0.3);
  if (!xs || !ys) throw new Error("could not find lpm Link's screen in Device Hub's window (is the app on a light screen?)");
  const sw = (xs[1] - xs[0]) * k;
  const sh = Math.round((sw * device.h) / device.w);
  return { x: win.x + xs[0] * k, y: win.y + ys[0] * k, w: sw, h: sh };
}

module.exports = { PhoneStage, findScreen };
