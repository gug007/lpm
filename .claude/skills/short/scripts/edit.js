// The cut of the finished video, in frames of the take. It opens cold on the
// payoff (a later stretch of the take) for as long as the first `open` lines are
// spoken, then plays the take from the next line on, minus the jump cuts. The
// opening lines' beats are never seen, so the last of them can do the setup
// (pick the project, start an agent) however long that takes; the ones before
// it must be quick, or their wait shows as silence over the payoff. Everything
// laid on the take's clock (lines, labels) goes through `toOutMs`.
const { FPS } = require("./camera");

const HOOK_TAIL_MS = 150;
const OPENING_GAP_MS = 600;

const frame = (ms) => Math.round((ms / 1000) * FPS);
const msOf = (f) => (f * 1000) / FPS;

function editList({ lines, totalMs, cuts = [], payoffMs = null, open = 1, log = () => {} }) {
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
  const main = [];
  let at = second;
  for (const [a, b] of drops) {
    if (a > at) main.push([at, a]);
    at = Math.max(at, b);
  }
  if (at < total) main.push([at, total]);
  const outFrames = hook + main.reduce((n, [a, b]) => n + b - a, 0);

  // A moment inside a jump cut (or the hook's hidden setup) lands where the
  // cut does.
  const toOutFrame = (f) => {
    if (f < second) return Math.min(f, hook);
    let out = hook;
    for (const [a, b] of main) {
      if (f < a) return out;
      if (f < b) return out + (f - a);
      out += b - a;
    }
    return out;
  };

  return {
    hook,
    payoff: [payoff, payoff + hook],
    main,
    outFrames,
    outMs: msOf(outFrames),
    toOutMs: (ms) => msOf(toOutFrame(frame(ms))),
  };
}

module.exports = { editList, frame, msOf };
