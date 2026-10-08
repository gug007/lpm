// One recording session per target: the website demo in headless Chromium, or
// the real desktop app on its own data directory under a screen capture. Both
// walk the same beats against the same narration clock and hand back the
// timeline the mux lays the audio (and, for the app, the cards) on.
const fs = require("fs");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");
const { openStage, OUT, FRAME, ZOOM } = require("./stage");
const { frameBox } = require("./compose");
const { Recorder } = require("./recorder");
const { launchApp, REPO, APP_BIN } = require("./app");
const { Capture } = require("./capture");
const { AppStage } = require("./appstage");
const { PhoneStage, findScreen } = require("./phonestage");
const { preparePhone } = require("./phone");
const { PHONE_LAYOUT, phoneLayout } = require("./phonecompose");
const { renderCards, APP_LAYOUT } = require("./cards");
const { sleep } = require("./words");
const { prepareState, killStaleServices } = require("./state");
const { onTeardown } = require("./teardown");

const GAP_MS = 450;
const LEAD_MS = 500;
const TAIL_MS = 1800;
// The app window is centred on the main display while it is captured, so a
// native open panel (centred on the display too) stays inside the recording;
// LESSON_WIN_X/Y pin it somewhere else.
const WINDOW_AT = process.env.LESSON_WIN_X
  ? { x: Number(process.env.LESSON_WIN_X), y: Number(process.env.LESSON_WIN_Y) || 80 }
  : { center: true };
// With a phone, Device Hub's iPhone window stands at the right of the main
// display and the app window left of it, `PHONE_GAP` points apart.
const PHONE_GAP = 40;

function mainScreen() {
  const out = execFileSync("osascript", ["-l", "JavaScript", "-e", 'ObjC.import("AppKit"); var f = $.NSScreen.mainScreen.frame; f.size.width + " " + f.size.height'], { encoding: "utf8" });
  const [w, h] = out.trim().split(" ").map(Number);
  return { w, h };
}

// Places the app window beside the phone's and returns the capture around
// both, in points, with each window's place inside it.
async function placeBesidePhone(app, phone, size) {
  const screen = mainScreen();
  const now = phone.window();
  const hub = phone.window({ x: screen.w - now.w - 24, y: Math.max(32, Math.round((screen.h - now.h) / 2) + 12) });
  await app.control.call("window", { x: hub.x - PHONE_GAP - size.w, y: Math.round(hub.y + hub.h / 2 - size.h / 2), top: true, focus: true });
  await sleep(500);
  const b = await app.control.call("bounds");
  const win = { x: b.x / b.scale, y: b.y / b.scale, w: b.w / b.scale, h: b.h / b.scale };
  const x = Math.min(win.x, hub.x);
  const y = Math.min(win.y, hub.y);
  const rect = { x, y, w: Math.max(win.x + win.w, hub.x + hub.w) - x, h: Math.max(win.y + win.h, hub.y + hub.h) - y };
  const inside = (r) => ({ x: Math.round((r.x - x) * b.scale), y: Math.round((r.y - y) * b.scale), w: Math.round(r.w * b.scale), h: Math.round(r.h * b.scale) });
  return { b, rect, region: inside(win), hub: inside(hub) };
}

// `progress` collects the lines done so far, for the partial timeline a failed
// take leaves; `check` throws when the recording can no longer be used.
async function runBeats(stage, lines, beats, t0, { gapMs = GAP_MS, tailMs = TAIL_MS, progress = {}, check = () => {} } = {}) {
  const timeline = (progress.lines = []);
  for (const [i, line] of lines.entries()) {
    const beat = beats[line.id];
    if (!beat) throw new Error(`no beat for narration line "${line.id}"`);
    check();
    progress.current = line.id;
    const startMs = Date.now() - t0;
    console.log(`beat ${line.id} @ ${(startMs / 1000).toFixed(2)}s`);
    stage.beginLine(line);
    await beat(stage, line);
    if (process.env.DEBUG_CARD) console.log(`  card after ${line.id}:`, JSON.stringify(await stage.cardState()));
    if (i === 0 && (await stage.isCovered())) await stage.reveal();
    await stage.frame(line.id);
    const rest = startMs + line.ms + gapMs - (Date.now() - t0);
    if (rest < -1500) console.log(`  dead air after ${line.id}: ${(-rest / 1000).toFixed(1)} s past its line`);
    if (rest > 0) await stage.hold(rest);
    timeline.push({ id: line.id, startMs, ms: line.ms });
  }
  progress.current = null;
  await stage.hold(tailMs);
  check();
  await stage.frame("end");
  return timeline;
}

// Runs in the app's page. The overlay installs a #lesson-tick of its own (a
// faint 1px dot in the corner the window's rounded mask hides), so the dot is
// placed on every blink, not only when this creates it.
function blinkTick(on) {
  let tick = document.getElementById("lesson-tick");
  if (!tick) {
    tick = document.createElement("div");
    tick.id = "lesson-tick";
    document.body.append(tick);
  }
  tick.style.cssText = `position:fixed;top:12px;left:50%;width:2px;height:2px;opacity:1;animation:none;z-index:2147483647;pointer-events:none;background:${on ? "#fff" : "#000"}`;
}

async function waitForFrames(rec, nudge) {
  const startedAt = Date.now();
  for (let n = 0; !rec.started && Date.now() - startedAt < 30000; n++) {
    await nudge(n);
    await sleep(20);
  }
  if (!rec.started) throw new Error("the recording never received a first frame");
}

async function recordDemo({ url, lines, beats, raw, framesDir }) {
  let t0 = Date.now();
  const { stage, page, close } = await openStage({
    url,
    framesDir,
    log: (m) => console.log(`  ${((Date.now() - t0) / 1000).toFixed(2)}s ${m}`),
  });
  await stage.frame("stage");
  await stage.cover();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const rec = new Recorder(raw);
  await page.screencast.start({ size: OUT, quality: 92, onFrame: (f) => rec.frame(f) });
  await waitForFrames(rec, (n) => stage.repaint(n));
  t0 = rec.startWall;
  stage.t0 = t0;
  await stage.hold(LEAD_MS);
  const timeline = await runBeats(stage, lines, beats, t0);
  const totalMs = Date.now() - t0;
  await page.screencast.stop();
  await rec.stop(totalMs);
  await close();
  return { totalMs, lines: timeline, zooms: stage.zooms };
}

// Which app the take shows: the commit, how much of the frontend was edited
// on top of it, and when the debug binary was built.
function appStamp(ui) {
  const git = (...a) => spawnSync("git", ["-C", REPO, ...a], { encoding: "utf8" }).stdout.trim();
  const dirty = git("status", "--porcelain", "--", "desktop/frontend").split("\n").filter(Boolean).length;
  const built = fs.existsSync(APP_BIN) ? fs.statSync(APP_BIN).mtime.toISOString() : null;
  return { commit: git("rev-parse", "--short", "HEAD"), dirtyFrontendFiles: dirty, binaryBuiltAt: built, ui };
}

// `phone` ({ device, env }, lesson.json "phone") puts lpm Link in the iOS
// Simulator beside the app and records both (phone.js, phonestage.js).
// `win` sizes the app window (points); `Stage` may extend AppStage with beat
// calls of its own, and whatever its `timelineExtras()` returns is saved with
// the timeline; `pace` tightens or loosens the gaps around the narration.
// Everything the take sets up is undone however it ends (teardown.js); a
// failed take throws with `partial` (the lines it got through) and leaves the
// screen at that moment in `errorShot`.
async function recordApp({ lines, beats, raw, framesDir, errorShot, lesson, lpmDir, keepState, mouse, win, Stage = AppStage, pace = {}, phone }) {
  const { gapMs = GAP_MS, leadMs = LEAD_MS, tailMs = TAIL_MS } = pace;
  const size = win || (phone ? PHONE_LAYOUT.app : { w: FRAME.width, h: FRAME.height });
  if (phone) Stage = PhoneStage;
  let t0 = Date.now();
  const log = (m) => console.log(`  ${((Date.now() - t0) / 1000).toFixed(2)}s ${m}`);
  const undo = [];
  const later = (fn) => {
    const off = onTeardown(fn);
    undo.push(async () => {
      off();
      await fn();
    });
  };
  const progress = {};
  let stage, capture, rec, app;
  let stopping = false;
  try {
    const state = prepareState({ lpmDir, lesson, keepState, log });
    if (beats.setup) await beats.setup({ lpmDir: state.lpmDir, workspace: state.workspace, lesson, settings: state.settings });
    if (!keepState) later(() => killStaleServices(state.lpmDir, log));
    app = await launchApp({ lpmDir: state.lpmDir, env: lesson.env, log });
    later(() => app.close());
    // Sizing is asynchronous on macOS; centring in the same call would use the
    // old size, so the window is sized first and placed once that has settled.
    let phoneSide = null;
    if (phone) {
      phoneSide = await preparePhone({ device: phone.device, env: phone.env, log });
      later(() => phoneSide.close());
    }
    await app.control.call("window", { w: size.w, h: size.h });
    await sleep(400);
    let b, placed;
    if (phoneSide) {
      placed = await placeBesidePhone(app, phoneSide, size);
      b = placed.b;
    } else {
      await app.control.call("window", { ...WINDOW_AT, top: true, focus: true });
      await sleep(500);
      b = await app.control.call("bounds");
    }
    const origin = { x: b.x / b.scale, y: b.y / b.scale, w: b.w / b.scale, h: b.h / b.scale, scale: b.scale };
    rec = new Recorder(raw);
    later(() => rec.stop(Date.now() - t0));
    const px = (r) => ({ x: Math.round(r.x * b.scale), y: Math.round(r.y * b.scale), w: Math.round(r.w * b.scale), h: Math.round(r.h * b.scale) });
    capture = placed
      ? new Capture({ rect: px(placed.rect), pid: [app.proc.pid, phoneSide.pid], scale: b.scale, onFrame: (f) => rec.frame(f) })
      : new Capture({ rect: { x: b.x, y: b.y, w: b.w, h: b.h }, pid: app.proc.pid, scale: b.scale, onFrame: (f) => rec.frame(f) });
    later(() => capture.stop());
    const layout = phoneSide ? phoneLayout(OUT, ZOOM) : null;
    stage = await Stage.open(app, capture, {
      framesDir, log, mouse, origin, out: OUT,
      box: layout ? layout.mac : frameBox(OUT, FRAME, ZOOM),
      phone: phoneSide && { driver: phoneSide.driver, press: phoneSide.press, layout },
    });
    later(() => stage.finish());
    await stage.frame("stage");
    await stage.cover();
    // A still window captures as identical frames and the recorder never
    // starts; a blinking dot (under the opening card) gives it a first change.
    let nudgeError = "";
    await waitForFrames(rec, (n) => app.control.evaluate(blinkTick, n % 2 === 0).catch((e) => (nudgeError = String(e)))).catch((e) => {
      throw new Error(`${e.message} (captured ${capture.frames} frames; nudge: ${nudgeError || "ok"}; ${capture.err.slice(-200)})`);
    });
    await app.control.evaluate(() => document.getElementById("lesson-tick")?.remove()).catch(() => {});
    const phoneRegion = placed && findScreen(capture.latest, placed.hub, phoneLayout(OUT, ZOOM).device);
    if (phoneRegion) {
      log(`phone screen at ${JSON.stringify(phoneRegion)} of the capture`);
      const k = b.scale;
      phoneSide.setScreen({ x: placed.rect.x + phoneRegion.x / k, y: placed.rect.y + phoneRegion.y / k, w: phoneRegion.w / k, h: phoneRegion.h / k });
    }
    t0 = rec.startWall;
    stage.t0 = t0;
    const check = () => {
      const ended = capture.ffmpeg.exitCode ?? capture.ffmpeg.signalCode;
      if (!stopping && ended != null) throw new Error(`the screen capture stopped mid-take (ffmpeg ${ended}): ${capture.err.slice(-300)}`);
      if (rec.failed) throw new Error(`the recording stopped mid-take: ${rec.failed}`);
    };
    await stage.hold(leadMs);
    const timeline = await runBeats(stage, lines, beats, t0, { gapMs, tailMs, progress, check });
    const totalMs = Date.now() - t0;
    stopping = true;
    await capture.stop();
    await rec.stop(totalMs);
    const extras = stage.timelineExtras ? stage.timelineExtras() : {};
    const warnings = stage.warnings?.length ? { warnings: stage.warnings } : {};
    const both = placed ? { region: placed.region, phone: { region: phoneRegion, hub: placed.hub, captureW: placed.rect.w } } : {};
    return { totalMs, lines: timeline, cards: stage.cards, zooms: stage.zooms, box: { w: b.w, h: b.h, scale: b.scale }, app: appStamp(app.ui), ...both, ...warnings, ...extras };
  } catch (e) {
    stopping = true;
    if (capture?.latest) {
      if (errorShot) fs.writeFileSync(errorShot, capture.latest);
      if (framesDir) fs.writeFileSync(path.join(framesDir, "99-error.jpg"), capture.latest);
    }
    e.partial = {
      failedLine: progress.current || null,
      elapsedMs: rec?.started ? Date.now() - t0 : 0,
      lines: progress.lines || [],
      cards: stage?.cards || [],
      zooms: stage?.zooms || [],
      warnings: stage?.warnings || [],
    };
    throw e;
  } finally {
    while (undo.length) {
      try {
        await undo.pop()();
      } catch (err) {
        log(`cleanup: ${err.message}`);
      }
    }
  }
}

// The topic cards of an app take, as clips for the mux; run after the take is
// saved so a rendering hiccup never costs the recording.
async function renderTimelineCards(timeline, dir) {
  const cardsDir = path.join(dir, "cards");
  fs.rmSync(cardsDir, { recursive: true, force: true });
  fs.mkdirSync(cardsDir, { recursive: true });
  return renderCards(timeline.cards || [], cardsDir, OUT, { layout: APP_LAYOUT });
}

module.exports = { recordDemo, recordApp, renderTimelineCards, runBeats, GAP_MS };
