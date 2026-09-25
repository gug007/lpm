// The cut of the finished video, in frames of the take. It opens cold on the
// payoff (a later stretch of the take) for as long as the hook line is spoken,
// then plays the take from the second line on, minus the jump cuts. The hook
// line's own beat is never seen, so it can do the setup (pick the project,
// start an agent) however long that takes. Everything laid on the take's clock
// (lines, labels) goes through `toOutMs`.
const { FPS } = require("./camera");

const HOOK_TAIL_MS = 150;

const frame = (ms) => Math.round((ms / 1000) * FPS);
const msOf = (f) => (f * 1000) / FPS;

function editList({ lines, totalMs, cuts = [], payoffMs = null, log = () => {} }) {
  const total = frame(totalMs);
  const second = lines.length > 1 ? frame(lines[1].startMs) : total;
  const hook = Math.min(second, frame(lines[0].startMs + lines[0].ms + HOOK_TAIL_MS));
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
