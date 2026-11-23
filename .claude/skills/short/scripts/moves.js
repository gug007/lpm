// The camera's recorded moves (tiktokstage.js), made ready for the cut. The
// camera is added at mux time, so unlike a click a push-in is not tied to the
// moment its beat asked for it: landMoves puts each one on its cue word, and
// lesson.json "zooms" can change one without a retake.
const { clampScale } = require("./shared")("keyframes");

// A push-in this quick still reads as a move rather than a cut.
const QUICK_MS = 260;
// Under this a move or an action still reads as landing on its word.
const LATE_MS = 300;

// `lines` are the timeline's, each with `spokenMs` (where its last word ends,
// ms into the line). A move whose beat reached it too late to finish on its cue
// starts earlier instead: no sooner than the move before it ends, the last
// click or glide before it (`notBefore`), or the last word of the line before.
// What still doesn't fit is played quicker. `lateMs` is what is left over.
function landMoves(zooms = [], lines = [], { open = 1 } = {}) {
  const out = [];
  for (const z of zooms.slice().sort((a, b) => a.startMs - b.startMs)) {
    let { startMs, ms } = z;
    if (z.cueMs != null && startMs + ms > z.cueMs) {
      const i = lines.findLastIndex((l) => l.startMs <= z.startMs);
      const before = i > open ? lines[i - 1] : null;
      const prev = out.at(-1);
      const floor = Math.max(before ? before.startMs + before.spokenMs : 0, prev ? prev.startMs + prev.ms : 0, z.notBefore);
      startMs = Math.min(startMs, Math.max(z.cueMs - ms, floor));
      ms = Math.min(ms, Math.max(QUICK_MS, z.cueMs - startMs));
    }
    out.push({ ...z, startMs, ms, lateMs: z.cueMs == null ? 0 : Math.max(0, startMs + ms - z.cueMs) });
  }
  return out;
}

// lesson.json "zooms": { "<line>#<n>": { scale, at, ms, by, drop } }. `at`
// re-aims inside the recorded target, `ms` changes the length and keeps the
// end, `by` shifts the move (ms, negative is earlier), `drop` removes it.
function editMoves(moves, edits = {}, log = () => {}) {
  for (const id of Object.keys(edits)) if (!moves.some((z) => z.id === id)) log(`zooms: no "${id}" in this take (${moves.map((z) => z.id).filter(Boolean).join(" ")})`);
  return moves.flatMap((z) => {
    const e = edits[z.id];
    if (!e) return [z];
    if (e.drop) return [];
    const out = { ...z };
    if (e.scale != null) out.scale = clampScale(e.scale);
    if (e.at && z.rect) Object.assign(out, { at: e.at, x: z.rect.x + z.rect.w * e.at[0], y: z.rect.y + z.rect.h * e.at[1] });
    else if (e.at) log(`zooms: "${z.id}" has no recorded target, so "at" can't re-aim it`);
    if (e.ms != null) Object.assign(out, { startMs: z.startMs + z.ms - e.ms, ms: e.ms });
    if (e.by) out.startMs += e.by;
    return [out];
  });
}

module.exports = { landMoves, editMoves, LATE_MS, QUICK_MS };
