// What the cut itself gets wrong, read off the plan (render.js) rather than off
// the picture: the pace, the cues, the framing and the voice. The results go
// into cut.json, and the checks after the mux (lesson's qa.js) report them with
// the rest.
const shared = require("./shared");
const { transcriptGaps } = shared("words");
const { speaker } = shared("voice");
const { mmss } = shared("chapters");
const { OUT, crop } = require("./camera");
const { msOf } = require("./edit");
const { LATE_MS } = require("./moves");

const HOOK_MAX_MS = 2500;
const LENGTH_MAX_MS = 45000;
const DEAD_AIR_MS = 1500;
const STILL_MS = 4000;
const FLASH_MS = 500;
// A target with this much of its width in the shot counts as framed.
const FRAMED_SHARE = 0.9;

const s1 = (ms) => `${(ms / 1000).toFixed(1)} s`;

function pace(p) {
  const { lines, edit, open } = p;
  const hook = lines.find((l) => !l.silent);
  const out = [{ level: "OK", check: "pace", message: `hook ${s1(hook?.ms ?? 0)}, opening ${s1(msOf(edit.hook))}, ${s1(edit.outMs)} in all` }];
  if (hook && hook.ms > HOOK_MAX_MS) out.push({ level: "WARN", check: "hook", message: `the hook runs ${s1(hook.ms)} (over ${s1(HOOK_MAX_MS)}); cut words from it, and scripts/rehook.sh voices it again without a retake` });
  if (edit.outMs > LENGTH_MAX_MS) out.push({ level: "WARN", check: "length", message: `${s1(edit.outMs)} long; 45 s or less holds viewers` });
  lines.forEach((l, i) => {
    const next = lines[i + 1];
    if (!next || l.silent || i < open - 1) return;
    const from = i < open ? edit.toOutMs(l.startMs + l.ms) : edit.toOutMs(l.startMs + l.spokenMs);
    const gap = next.outMs - from;
    if (gap > DEAD_AIR_MS) out.push({ level: "WARN", check: "dead air", message: `${s1(gap)} with nothing said after "${l.id}" at ${mmss(from)}; move the steps that run past it under the next line, or s.skip() the wait` });
  });
  for (const n of p.notes) out.push({ level: "WARN", check: "cut", message: n });
  return out;
}

// The longest stretch between the opening and the last line in which nothing
// but the captions changes: no camera move, glide, click, label, key or cut.
function stillness(p) {
  const { edit, lines, moves, pointer, track, open } = p;
  const from = lines[open]?.outMs ?? edit.outMs;
  const to = lines.at(-1).outMs;
  if (to <= from) return [];
  const at = [];
  for (const m of [...moves, ...pointer]) at.push(edit.toOutMs(m.startMs), edit.toOutMs(m.startMs + m.ms));
  for (const l of lines) at.push(l.outMs);
  for (const x of [...track.stickers, ...track.keys]) at.push(x.startMs);
  for (const [from] of edit.main) at.push(edit.toOutMs(msOf(from)));
  const times = [from, ...at.filter((t) => t > from && t < to), to].sort((a, b) => a - b);
  let longest = { ms: 0, at: from };
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] > longest.ms) longest = { ms: times[i] - times[i - 1], at: times[i - 1] };
  if (longest.ms <= STILL_MS) return [];
  return [{ level: "WARN", check: "pace", message: `nothing moves for ${s1(longest.ms)} from ${mmss(longest.at)}; a camera move or a click every 1.5-3 s keeps viewers` }];
}

function cues(p) {
  const hidden = p.lines[p.open]?.startMs ?? Infinity;
  return p.moves
    .filter((z) => z.lateMs > LATE_MS && z.startMs >= hidden)
    .map((z) => ({ level: "WARN", check: "cue", message: `camera move ${z.id} lands ${s1(z.lateMs)} after its word; the steps before it ran past the word, so start them sooner or cue a later word` }));
}

// Where a recorded target (window points) falls in the finished frame, its
// camera move landed.
function shotOf(z, g, scale) {
  const c = crop(g, z.scale);
  const x = (pt) => ((g.ox + pt * scale - cx) / c.w + 0.5) * OUT.width;
  const cx = Math.min(Math.max(g.ox + z.x * scale, c.w / 2), g.canvas.w - c.w / 2);
  return { left: x(z.rect.x), right: x(z.rect.x + z.rect.w) };
}

function framing(p) {
  const out = [];
  for (const z of p.moves) {
    if (!z.rect || !(z.scale > 1.05) || z.at.some((v) => v < 0 || v > 1) || Math.abs(z.at[0] - 0.5) > 0.15) continue;
    const { left, right } = shotOf(z, p.g, p.scale);
    const width = right - left;
    const shown = Math.max(0, Math.min(right, OUT.width) - Math.max(left, 0)) / width;
    const fit = Math.floor(((z.scale * OUT.width * 0.96) / width) * 10) / 10;
    if (shown >= FRAMED_SHARE || fit < 1.1) continue;
    out.push({ level: "NOTE", check: "framing", message: `${z.id} shows ${Math.round(shown * 100)}% of its target's width at ${z.scale}x; ${fit}x shows all of it (lesson.json "zooms": { "${z.id}": { "scale": ${fit} } }, then --mux-only)` });
  }
  return out;
}

function flashes(p) {
  return p.track.stickers
    .filter((s) => s.endMs - s.startMs < FLASH_MS && !s.plain)
    .map((s) => ({ level: "WARN", check: "sticker", message: `"${s.text}" is up for only ${s1(s.endMs - s.startMs)} at ${mmss(s.startMs)}` }));
}

// The voice can skip or change a word; the captions show the script either
// way, so only the transcript gives it away.
const GAP_SAYS = {
  skipped: { level: "WARN", what: "the voice skipped words the captions show" },
  differs: { level: "WARN", what: "the voice may have said something else" },
  spelling: { level: "NOTE", what: "heard as other words, most likely only spelled another way" },
};
function voice(lesson, p) {
  const say = speaker(lesson.pronounce);
  const out = [];
  for (const { line } of p.lines) {
    if (!line?.text || !line.words?.length) continue;
    for (const g of transcriptGaps(say(line.text), line.words)) {
      const { level, what } = GAP_SAYS[g.kind];
      const fix = g.entry ? `if the two sound alike, add to lesson.json "heard": { ${g.entry.map((x) => JSON.stringify(x)).join(": ")} }; if not, reword the line` : "reword the line and take again";
      out.push({ level, check: "voice", message: `line "${line.id}": ${what} (wrote "${g.wrote}", heard "${g.heard}"); ${fix}` });
    }
  }
  return out;
}

const checksFor = (lesson, p) => [...pace(p), ...cues(p), ...stillness(p), ...framing(p), ...flashes(p), ...voice(lesson, p)];

module.exports = { checksFor, HOOK_MAX_MS, LENGTH_MAX_MS };
