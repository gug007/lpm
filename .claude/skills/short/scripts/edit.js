// The cut of the finished video, in frames of the take. It opens cold on the
// payoff (a later stretch of the take) for as long as the first `open` lines are
// spoken, then plays the take from the next line on, minus the jump cuts and
// with long silences sped up (pace.js). The opening lines' beats are never
// seen, so the last of them can do the setup (pick the project, start an agent)
// however long that takes; the ones before it must be quick, or their wait
// shows as silence over the payoff. Everything laid on the take's clock (lines,
// labels) goes through `toOutMs`.
const { FPS } = require("./camera");

const HOOK_TAIL_MS = 150;
const OPENING_GAP_MS = 600;

const frame = (ms) => Math.round((ms / 1000) * FPS);
const msOf = (f) => (f * 1000) / FPS;

function editList({ lines, totalMs, cuts = [], waits = [], payoffMs = null, open = 1, log = () => {} }) {
  const total = frame(totalMs);
  const n = Math.max(1, Math.min(open, lines.length));
  const second = lines.length > n ? frame(lines[n].startMs) : total;
  const last = lines[n - 1];
  const hook = Math.min(second, frame(last.startMs + last.ms + HOOK_TAIL_MS));
  for (let i = 1; i < n; i++) {
    const gap = lines[i].startMs - (lines[i - 1].startMs + lines[i - 1].ms);
    if (gap > OPENING_GAP_MS) log(`${(gap / 1000).toFixed(1)}s of silence before "${lines[i].id}" in the opening: move the slow setup into the last opening line's beat`);
  }
  let payoff = payoffMs == null ? total - hook : frame(payoffMs);
  if (payoffMs == null) log("no s.payoff() in the beats: opening on the last moments of the take");
  if (payoff + hook > total) {
    log(`the payoff shot runs past the end of the take; opening ${((payoff + hook - total) / FPS).toFixed(1)}s earlier`);
    payoff = total - hook;
  }
  payoff = Math.max(0, payoff);

  const drops = cuts
    .map((c) => [Math.max(frame(c.fromMs), second), Math.min(frame(c.toMs), total)])
    .filter(([a, b]) => b - a > 1)
    .sort((a, b) => a[0] - b[0]);
  const kept = [];
  let at = second;
  for (const [a, b] of drops) {
    if (a > at) kept.push([at, a]);
    at = Math.max(at, b);
  }
  if (at < total) kept.push([at, total]);
  const main = kept.flatMap((range) => split(range, waits));
  const outFrames = hook + main.reduce((n, shot) => n + played(shot), 0);

  // A moment inside a jump cut (or the hook's hidden setup) lands where the
  // cut does.
  const toOutFrame = (f) => {
    if (f < second) return Math.min(f, hook);
    let out = hook;
    for (const shot of main) {
      const [a, b, rate = 1] = shot;
      if (f < a) return out;
      if (f < b) return out + Math.round((f - a) / rate);
      out += played(shot);
    }
    return out;
  };
  const seen = (f) => main.some(([a, b]) => f >= a && f < b);

  return {
    hook,
    payoff: [payoff, payoff + hook],
    main,
    outFrames,
    outMs: msOf(outFrames),
    toOutMs: (ms) => msOf(toOutFrame(frame(ms))),
    seen: (ms) => seen(frame(ms)),
  };
}

// A shot is [from, to] in frames of the take, or [from, to, rate] played
// faster. How many frames of the video it fills:
const played = ([a, b, rate = 1]) => Math.max(1, Math.round((b - a) / rate));

function split([from, to], waits) {
  const out = [];
  let at = from;
  for (const w of waits) {
    const a = Math.max(frame(w.fromMs), at);
    const b = Math.min(frame(w.toMs), to);
    if (b - a < 2) continue;
    if (a > at) out.push([at, a]);
    out.push([a, b, w.rate]);
    at = b;
  }
  if (at < to) out.push([at, to]);
  return out;
}

// The frame of the take that plays at frame `f` of the video, or null past its
// end. `edit` is a cut as editList made it or cut.json kept it.
function takeFrame({ hook, payoff, main }, f) {
  if (f < hook) return payoff[0] + f;
  let left = f - hook;
  for (const shot of main) {
    const [a, , rate = 1] = shot;
    if (left < played(shot)) return a + Math.round(left * rate);
    left -= played(shot);
  }
  return null;
}

module.exports = { editList, played, takeFrame, frame, msOf };
