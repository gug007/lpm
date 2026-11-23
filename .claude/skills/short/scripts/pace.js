// Dead air inside a short: a beat that runs past its line leaves the next one
// waiting in silence, and that is where viewers leave. Each such stretch plays
// faster, so whatever happens in it is still seen.

const WAIT_MIN_MS = 1600;
const WAIT_TO_MS = 900;
const MAX_RATE = 4;
// Breathing room kept in real time after the last word and before the next.
const AFTER_MS = 250;
const BEFORE_MS = 100;

const overlap = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));

// The stretches to speed up, { fromMs, toMs, rate } in take time, between the
// lines that are seen (from `open` on). A silent line is a pause on purpose.
// `cuts` are already gone from the video.
function slowStretches({ lines, open = 1, cuts = [] }) {
  const out = [];
  for (let i = open; i < lines.length - 1; i++) {
    const { startMs, spokenMs, silent } = lines[i];
    if (silent) continue;
    const fromMs = startMs + spokenMs + AFTER_MS;
    const toMs = lines[i + 1].startMs - BEFORE_MS;
    const left = toMs - fromMs - cuts.reduce((n, c) => n + overlap(fromMs, toMs, c.fromMs, c.toMs), 0);
    if (left < WAIT_MIN_MS) continue;
    out.push({ after: lines[i].id, fromMs, toMs, rate: Math.min(MAX_RATE, +(left / WAIT_TO_MS).toFixed(2)) });
  }
  return out;
}

module.exports = { slowStretches, MAX_RATE };
