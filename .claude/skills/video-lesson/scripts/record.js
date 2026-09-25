// One recording session per target: the website demo in headless Chromium, or
// the real desktop app on its own data directory under a screen capture. Both
// walk the same beats against the same narration clock and hand back the
// timeline the mux lays the audio (and, for the app, the cards) on.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { openStage, OUT, FRAME, ZOOM } = require("./stage");
const { frameBox } = require("./compose");
const { Recorder } = require("./recorder");
const { spawnSync } = require("child_process");
const { launchApp } = require("./app");
const { Capture } = require("./capture");
const { AppStage } = require("./appstage");
const { renderCards } = require("./cards");
const { sleep } = require("./words");

const GAP_MS = 450;
const LEAD_MS = 500;
const TAIL_MS = 1800;
// The app window is centred on the main display while it is captured, so a
// native open panel (centred on the display too) stays inside the recording;
// LESSON_WIN_X/Y pin it somewhere else.
const WINDOW_AT = process.env.LESSON_WIN_X
  ? { x: Number(process.env.LESSON_WIN_X), y: Number(process.env.LESSON_WIN_Y) || 80 }
  : { center: true };
const DEFAULT_WORKSPACE = "/Users/Shared/lpm-lessons";

async function runBeats(stage, lines, beats, t0, { gapMs = GAP_MS, tailMs = TAIL_MS } = {}) {
  const timeline = [];
  for (const [i, line] of lines.entries()) {
    const beat = beats[line.id];
    if (!beat) throw new Error(`no beat for narration line "${line.id}"`);
    const startMs = Date.now() - t0;
    console.log(`beat ${line.id} @ ${(startMs / 1000).toFixed(2)}s`);
    stage.beginLine(line);
    await beat(stage, line);
    if (process.env.DEBUG_CARD) console.log(`  card after ${line.id}:`, JSON.stringify(await stage.cardState()));
    if (i === 0 && (await stage.isCovered())) await stage.reveal();
    await stage.frame(line.id);
    const rest = startMs + line.ms + gapMs - (Date.now() - t0);
    if (rest > 0) await stage.hold(rest);
    timeline.push({ id: line.id, startMs, ms: line.ms });
  }
  await stage.hold(tailMs);
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

function killTree(pid) {
  const kids = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" }).stdout || "";
  for (const kid of kids.split(/\s+/).filter(Boolean)) killTree(Number(kid));
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // already gone
  }
}

// Services a take started outlive the app: they belong to lpm's session
// daemon, a separate process, and wiping the data directory only takes away
// its socket. Left running it holds their ports, and the next take opens on a
// port-conflict prompt. The daemon is matched on the LPM_DIR in its own
// environment, so the one behind the user's real projects is never touched.
function killStaleServices(lpmDir, log) {
  const ps = spawnSync("ps", ["-Ao", "pid=,command="], { encoding: "utf8" }).stdout || "";
  for (const line of ps.split("\n")) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!m || !m[2].includes("--session-daemon")) continue;
    const env = spawnSync("ps", ["eww", "-o", "command=", "-p", m[1]], { encoding: "utf8" }).stdout || "";
    if (!env.includes(`LPM_DIR=${lpmDir}`)) continue;
    log(`stopping services left over from an earlier take (daemon ${m[1]})`);
    killTree(Number(m[1]));
  }
}

// A pristine data directory for every take, so the app opens the way it does
// right after install; the lesson may seed settings and a workspace of demo
// project folders through `setup` in its beats.
function prepareState({ lpmDir, lesson, beats, keepState, log = () => {} }) {
  const real = path.join(os.homedir(), ".lpm");
  if (path.resolve(lpmDir) === real) throw new Error(`refusing to record on the real ${real}; pass --lpm-dir`);
  if (!keepState) {
    killStaleServices(path.resolve(lpmDir), log);
    fs.rmSync(lpmDir, { recursive: true, force: true });
  }
  fs.mkdirSync(lpmDir, { recursive: true });
  const settingsFile = path.join(lpmDir, "settings.json");
  const settings = (patch) => {
    const cur = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, "utf8")) : {};
    fs.writeFileSync(settingsFile, JSON.stringify({ ...cur, ...patch }, null, 2));
  };
  if (!keepState) {
    settings(lesson.settings || {});
    // The sidebar meters: Codex reads its own session files, Claude only the
    // app's last reading — copied in (the real directory is only read) so the
    // meters look like a configured app. `"limits": false` leaves them out.
    const reading = path.join(real, "agent-limits.json");
    if (lesson.limits !== false && fs.existsSync(reading)) {
      fs.copyFileSync(reading, path.join(lpmDir, "agent-limits.json"));
      settings({ claudeLimitsEnabled: true });
    }
  }
  const workspace = process.env.LPM_LESSON_WORKSPACE || DEFAULT_WORKSPACE;
  if (!keepState && (workspace === DEFAULT_WORKSPACE || workspace.startsWith(lpmDir))) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
  fs.mkdirSync(workspace, { recursive: true });
  return { workspace, settings };
}

// `win` sizes the app window (points); `Stage` may extend AppStage with beat
// calls of its own, and whatever its `timelineExtras()` returns is saved with
// the timeline; `pace` tightens or loosens the gaps around the narration.
async function recordApp({ lines, beats, raw, framesDir, lesson, dir, lpmDir, keepState, mouse, win, Stage = AppStage, pace = {} }) {
  const { gapMs = GAP_MS, leadMs = LEAD_MS, tailMs = TAIL_MS } = pace;
  const size = win || { w: FRAME.width, h: FRAME.height };
  let t0 = Date.now();
  const log = (m) => console.log(`  ${((Date.now() - t0) / 1000).toFixed(2)}s ${m}`);
  const { workspace, settings } = prepareState({ lpmDir, lesson, beats, keepState, log });
  if (beats.setup) await beats.setup({ lpmDir, workspace, lesson, settings });
  const app = await launchApp({ lpmDir, env: lesson.env, log });
  // Sizing is asynchronous on macOS; centring in the same call would use the
  // old size, so the window is sized first and placed once that has settled.
  await app.control.call("window", { w: size.w, h: size.h });
  await sleep(400);
  await app.control.call("window", { ...WINDOW_AT, top: true, focus: true });
  await sleep(500);
  const b = await app.control.call("bounds");
  const origin = { x: b.x / b.scale, y: b.y / b.scale, w: b.w / b.scale, h: b.h / b.scale, scale: b.scale };
  const rec = new Recorder(raw);
  const capture = new Capture({ rect: { x: b.x, y: b.y, w: b.w, h: b.h }, onFrame: (f) => rec.frame(f) });
  let stage;
  try {
    stage = await Stage.open(app, capture, { framesDir, log, mouse, origin, out: OUT, box: frameBox(OUT, FRAME, ZOOM) });
    await stage.frame("stage");
    await stage.cover();
    // A still window captures as identical frames and the recorder never
    // starts; a blinking dot (under the opening card) gives it a first change.
    let nudgeError = "";
    await waitForFrames(rec, (n) => app.control.evaluate(blinkTick, n % 2 === 0).catch((e) => (nudgeError = String(e)))).catch((e) => {
      throw new Error(`${e.message} (captured ${capture.frames} frames; nudge: ${nudgeError || "ok"}; ${capture.err.slice(-200)})`);
    });
    await app.control.evaluate(() => document.getElementById("lesson-tick")?.remove()).catch(() => {});
    t0 = rec.startWall;
    stage.t0 = t0;
    await stage.hold(leadMs);
    const timeline = await runBeats(stage, lines, beats, t0, { gapMs, tailMs });
    const totalMs = Date.now() - t0;
    await capture.stop();
    await rec.stop(totalMs);
    stage.finish();
    await app.close();
    const extras = stage.timelineExtras ? stage.timelineExtras() : {};
    return { totalMs, lines: timeline, cards: stage.cards, zooms: stage.zooms, box: { w: b.w, h: b.h, scale: b.scale }, ...extras };
  } catch (e) {
    // The screen at the moment of failure, next to the dry-run frames.
    if (framesDir && capture.latest) fs.writeFileSync(path.join(framesDir, "99-error.jpg"), capture.latest);
    if (stage) stage.finish();
    await capture.stop().catch(() => {});
    await app.close().catch(() => {});
    throw e;
  }
}

// The topic cards of an app take, as clips for the mux; run after the take is
// saved so a rendering hiccup never costs the recording.
async function renderTimelineCards(timeline, dir) {
  const cardsDir = path.join(dir, "cards");
  fs.rmSync(cardsDir, { recursive: true, force: true });
  fs.mkdirSync(cardsDir, { recursive: true });
  return renderCards(timeline.cards || [], cardsDir, OUT);
}

module.exports = { recordDemo, recordApp, renderTimelineCards };
