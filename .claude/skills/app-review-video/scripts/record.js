// Recording: the rectangle around the review app and the iPhone Mirroring
// window, everything else on the Mac left out, the pointer shown. The capture
// runs detached so the agent can drive both apps with computer use meanwhile;
// `mark` stamps the step captions the render lays over the video.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { helper, readState, writeState, windows, phoneWindow, alive } = require("./session");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAD = 12;

function captureRect(app, phone, screen) {
  const x = Math.max(0, Math.min(app.x, phone.x) - PAD);
  const y = Math.max(0, Math.min(app.y, phone.y) - PAD);
  const r = Math.min(screen.w, Math.max(app.x + app.w, phone.x + phone.w) + PAD);
  const b = Math.min(screen.h, Math.max(app.y + app.h, phone.y + phone.h) + PAD);
  const even = (v) => Math.round(v / 2) * 2;
  return { x, y, w: even(r - x), h: even(b - y) };
}

async function start({ fps = 30, scale = 2, log = console.log } = {}) {
  const state = readState();
  if (!state.pid || !alive(state.pid)) throw new Error("the review app is not running; run `review.js setup` first");
  if (state.recorder && alive(state.recorder)) throw new Error(`already recording (pid ${state.recorder})`);
  const { screen, list } = windows();
  const phone = phoneWindow();
  const app = list.filter((w) => w.pid === state.pid && w.layer === 0).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (!app) throw new Error("the review app has no window on screen");
  const rect = captureRect(app, phone, screen);
  const file = path.join(state.out, "raw.mov");
  const startFile = path.join(state.out, "start.txt");
  fs.rmSync(startFile, { force: true });
  fs.rmSync(path.join(state.out, "marks.jsonl"), { force: true });
  const args = [file, rect.x, rect.y, rect.w, rect.h, rect.w * scale, rect.h * scale, fps, state.pid, phone.pid].map(String);
  const proc = spawn(helper("reviewcap"), args, {
    detached: true,
    stdio: ["ignore", fs.openSync(startFile, "w"), fs.openSync(path.join(state.out, "reviewcap.log"), "w")],
  });
  proc.unref();
  writeState({ recorder: proc.pid, recording: { file, rect, scale, fps, app, phone } });
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    if (!alive(proc.pid)) throw new Error(`the recorder exited: ${fs.readFileSync(path.join(state.out, "reviewcap.log"), "utf8").slice(-500)}`);
    const t = fs.readFileSync(startFile, "utf8").trim();
    if (t) {
      writeState({ recording: { ...readState().recording, startedAt: Number(t) } });
      log(`recording ${rect.w}x${rect.h} pt at (${rect.x},${rect.y}) → ${file}`);
      return;
    }
  }
  log("recording started; the first frame arrives with the next change on screen");
}

// SIGINT makes the recorder finish the movie; its exit means the file is whole.
async function stop({ log = console.log } = {}) {
  const state = readState();
  if (!state.recorder) throw new Error("not recording");
  if (alive(state.recorder)) process.kill(state.recorder, "SIGINT");
  for (let i = 0; i < 100 && alive(state.recorder); i++) await sleep(100);
  if (alive(state.recorder)) throw new Error(`the recorder (pid ${state.recorder}) did not finish`);
  const startedAt = Number(fs.readFileSync(path.join(state.out, "start.txt"), "utf8").trim()) || state.recording.startedAt;
  writeState({ recorder: null, recording: { ...state.recording, startedAt, stoppedAt: Date.now() } });
  fs.writeFileSync(path.join(state.out, "recording.json"), JSON.stringify({ ...readState().recording, name: state.name }, null, 2));
  log(`stopped; ${state.recording.file} (${(fs.statSync(state.recording.file).size / 1e6).toFixed(1)} MB)`);
}

function log(entry) {
  const state = readState();
  if (!state.recorder || !alive(state.recorder)) throw new Error("not recording");
  fs.appendFileSync(path.join(state.out, "marks.jsonl"), JSON.stringify({ t: Date.now(), ...entry }) + "\n");
}

// A step caption: shown from now until the next mark (or the end).
const mark = (text, sub) => log({ text, sub: sub || undefined });

// `cut` drops everything since the last `checkpoint` from the video: set one
// before an uncertain action, cut when it went wrong and redo it.
const checkpoint = () => log({ type: "checkpoint" });
const cut = () => log({ type: "cut" });

module.exports = { start, stop, mark, checkpoint, cut };
