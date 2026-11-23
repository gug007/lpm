// Cuts a take into the finished vertical video: the window through the camera,
// shot by shot, with the text track over it, the voice and the bed under it.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const shared = require("./shared");
const { DEFAULT_BED, RATE, soundtrack } = shared("mix");
const { CAPTURE_IN, MASTER_OUT, MASTER_TAGS, STILL_OUT } = shared("compose");
const { fitLines } = shared("fit");
const { keepPreviousCut } = shared("takes");
const { FPS, geometry, cameraKeys, cameraFilter } = require("./camera");
const { editList, played } = require("./edit");
const { landMoves, editMoves } = require("./moves");
const { slowStretches } = require("./pace");
const { textTrack } = require("./texttrack");
const { renderBackdrop, renderTrack } = require("./overlays");
const { SLAM } = require("./look");
const { checksFor } = require("./checks");
const { makeSheet, momentsOf } = require("./sheet");

const MUSIC_UNDER_VOICE_LU = 11;
const WINDOW_RADIUS_PT = 14;
const COVER_MS = 600;

const looped = (file, seconds) => ["-framerate", String(FPS), "-loop", "1", "-t", seconds.toFixed(3), "-i", file];

// The window on its canvas, through the camera: [in] is the capture, `bg` and
// `mask` the input indexes of the canvas and the rounded mask. Every shot, one
// played faster included, is held to its exact length in frames, or the sound
// and the text after it drift. A faster shot drops its frames first, so none is
// drawn for nothing.
function framed(input, bg, mask, g, keys, shot, label) {
  const [from, , rate = 1] = shot;
  const faster = rate === 1 ? "" : `setpts=(PTS-STARTPTS)/${rate},fps=${FPS},`;
  return (
    `[${input}:v]${faster}scale=${CAPTURE_IN},format=rgba[w${label}];[${mask}:v]format=gray[k${label}];[w${label}][k${label}]alphamerge[a${label}];` +
    `[${bg}:v][a${label}]overlay=x=${g.ox}:y=${g.oy}:eof_action=endall:shortest=1,${cameraFilter(keys, g, from, rate)},setsar=1,` +
    `tpad=stop_mode=clone:stop=3,trim=end_frame=${played(shot)},setpts=PTS-STARTPTS[${label}]`
  );
}

// The opening lines play over the cold open, not over their own beats, so a
// re-spoken hook only re-times the opening (saved to the timeline); every
// other line still has to fit the slot its take recorded.
function retimeOpening(t, lines, open) {
  const out = { ...t, lines: t.lines.map((tl, i) => {
    const line = lines.find((l) => l.id === tl.id);
    return i < open && line && !line.silent && line.ms != null && line.ms !== tl.ms ? { ...tl, ms: line.ms } : tl;
  }) };
  return { t: out, changed: out.lines.some((tl, i) => tl !== t.lines[i]) };
}

const spokenMs = (line) => (line.words?.length ? Math.min(line.ms, Math.round(line.words.at(-1).end * 1000)) : line.ms);

// Everything decided before a frame is drawn: the cut, the camera and the text,
// all on the finished clock. Pure, but for the log.
function plan({ lesson, timeline: t, lines, log = () => {} }) {
  const open = lesson.open ?? 1;
  const notes = [];
  const note = (m) => {
    notes.push(m);
    log(m);
  };
  const timed = t.lines.map((tl) => {
    const line = lines.find((l) => l.id === tl.id);
    return { ...tl, line, spokenMs: spokenMs(line), silent: !!line.silent };
  });
  const waits = lesson.speedUpWaits === false ? [] : slowStretches({ lines: timed, open, cuts: t.cuts });
  for (const w of waits) log(`silence after "${w.after}" (${((w.toMs - w.fromMs) / 1000).toFixed(1)} s) plays at ${w.rate}x (lesson.json "speedUpWaits": false leaves it)`);
  const edit = editList({ lines: t.lines, totalMs: t.totalMs, cuts: t.cuts, waits, payoffMs: t.payoffMs, open, log: note });
  const g = geometry({ w: t.box.w, h: t.box.h }, { shiftY: lesson.windowShiftY });
  const moves = editMoves(landMoves(t.zooms, timed, { open }), lesson.zooms, note);
  const keys = cameraKeys({ zooms: moves, pointer: t.pointer, g, scale: t.box.scale });
  const placed = timed.map((l) => ({ ...l, outMs: edit.toOutMs(l.startMs) }));
  const onCut = (list) => list.map((l) => ({ ...l, startMs: edit.toOutMs(l.startMs) }));
  const track = {
    ...textTrack({
      lines: placed,
      labels: onCut(t.labels || []),
      presses: lesson.keys === false ? [] : onCut((t.presses || []).filter((p) => edit.seen(p.startMs))),
      outMs: edit.outMs,
      headline: lesson.headline ?? placed[0].line.headline,
      headlineMs: lesson.headlineMs,
      cta: lesson.cta === false ? null : lesson.cta || "lpm.cx",
      open,
      slam: lesson.slam,
    }),
    stickerTop: lesson.stickerTop,
    slamTop: lesson.slamTop,
  };
  return { open, edit, g, scale: t.box.scale, moves, pointer: t.pointer || [], keys, lines: placed, track, notes, coverMs: lesson.slam ? SLAM.coverMs : COVER_MS };
}

function ffmpeg(argv, what = "ffmpeg") {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...argv], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${what} failed (${r.error?.code || r.signal || `exit ${r.status}`}):\n${(r.stderr || "").slice(-2500)}`);
}

// The frame of the opening the cover shows, its headline (`text`) on and no
// caption.
function makeCover({ P, p, look, text }) {
  const from = p.edit.payoff[0] + Math.round((p.coverMs / 1000) * FPS);
  const at = (from / FPS).toFixed(3);
  ffmpeg([
    "-ss", at, "-t", "0.1", "-i", P.raw, ...looped(look.bg, 0.1), ...looped(look.mask, 0.1), "-i", text,
    "-filter_complex", `${framed(0, 1, 2, p.g, p.keys, [from, from + 1], "c")};[3:v]format=rgba[t];[c][t]overlay=0:0:format=auto,${MASTER_OUT},scale=${STILL_OUT}[out]`,
    "-map", "[out]", "-frames:v", "1", "-q:v", "2", path.join(P.home, "cover.jpg"),
  ], "the cover");
}

// `P` is where the take lives and the video goes: { home, raw, timeline, mp4 }.
// A video already there moves into its take's cuts/. Returns the timeline it
// cut and what the checks found.
async function render({ P, dirs, lesson, lines, music }) {
  const read = JSON.parse(fs.readFileSync(P.timeline, "utf8"));
  const { t, changed } = retimeOpening(read, lines, lesson.open ?? 1);
  if (changed) {
    fs.writeFileSync(P.timeline, JSON.stringify(t, null, 2));
    console.log(`opening re-timed to the new hook: ${(t.lines[0].ms / 1000).toFixed(2)}s`);
  }
  const fit = fitLines(t, lines);
  for (const n of fit.notes) console.log(n);
  if (fit.errors.length) throw new Error(fit.errors.join("\n"));
  const p = plan({ lesson, timeline: t, lines, log: (m) => console.log(m) });
  const { edit, g, keys, track } = p;
  if (p.moves.some((z) => z.id)) console.log(`camera: ${p.moves.map((z) => z.id).filter(Boolean).join(" ")} (lesson.json "zooms" adjusts one by id)`);
  const look = await renderBackdrop(dirs.look, g, WINDOW_RADIUS_PT * t.box.scale);
  const overlay = await renderTrack(dirs.overlay, track, edit.outMs, p.coverMs);
  console.log(`text track: ${overlay.frames} changes, ${overlay.painted} painted`);
  console.log(`opening on the payoff: ${(edit.hook / FPS).toFixed(2)}s`);

  // Each shot is read on its own from its first frame, so the camera runs over
  // the frames the video keeps rather than the whole take (a 58-minute race
  // took as long again to render).
  const inputs = [];
  let count = 0;
  const input = (...args) => {
    inputs.push(...args);
    return count++;
  };
  const shot = (range, label) => {
    const [a, b, rate = 1] = range;
    const seconds = (b - a) / FPS;
    const capture = input("-ss", (a / FPS).toFixed(3), "-t", seconds.toFixed(3), "-i", P.raw);
    return framed(capture, input(...looped(look.bg, seconds / rate)), input(...looped(look.mask, seconds / rate)), g, keys, range, label);
  };
  const shots = [[edit.payoff[0], edit.payoff[0] + edit.hook], ...edit.main];
  const parts = shots.map((range, i) => shot(range, `s${i}`));
  parts.push(`${shots.map((_, i) => `[s${i}]`).join("")}concat=n=${shots.length}:v=1:a=0[cut]`);
  const text = input("-f", "concat", "-safe", "0", "-i", overlay.listFile);
  parts.push(`[${text}:v]format=rgba[text];[cut][text]overlay=0:0:eof_action=pass:format=auto,${MASTER_OUT}[vout]`);

  const bed = music && fs.existsSync(music) ? music : null;
  if (music && !bed) console.log(`no music: ${music} is missing${music === DEFAULT_BED ? " (preflight.js downloads it)" : ""}`);
  const clips = p.lines.filter((l) => !l.silent).map((l) => ({ id: l.id, wav: l.line.wav, startMs: Math.round(l.outMs) }));
  // The bed starts at full level under the hook and is gone with the last frame.
  const sound = soundtrack({ clips, base: count, bed, totalMs: edit.outMs, underLu: MUSIC_UNDER_VOICE_LU, fadeInS: 0.15, fadeOutS: 0.8 });
  inputs.push(...sound.inputs);
  parts.push(sound.filter);

  const part = `${P.mp4}.part`;
  const started = Date.now();
  try {
    ffmpeg([
      ...inputs,
      "-filter_complex", parts.join(";"),
      "-map", "[vout]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(FPS), ...MASTER_TAGS,
      "-c:a", "aac", "-b:a", "192k", "-ar", String(RATE),
      "-t", (edit.outMs / 1000).toFixed(3),
      "-movflags", "+faststart", "-f", "mp4", part,
    ], "the render");
    const kept = keepPreviousCut(P.home, P.mp4, t.take);
    if (kept) console.log(`the previous render moved to ${kept}`);
    fs.renameSync(part, P.mp4);
  } finally {
    fs.rmSync(part, { force: true });
  }
  const checks = checksFor(lesson, p);
  const moments = momentsOf(p);
  fs.writeFileSync(path.join(P.home, "cut.json"), JSON.stringify({ edit, camera: keys, moves: p.moves, track, checks }, null, 2));
  console.log(`muxed ${(edit.outMs / 1000).toFixed(1)}s in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${P.mp4}`);
  makeCover({ P, p, look, text: overlay.cover });
  await makeSheet({ mp4: P.mp4, moments, lookDir: dirs.look, file: path.join(P.home, "sheet.jpg") });
  console.log(`cover.jpg, sheet.jpg (${moments.length} moments) -> ${P.home}`);
  return { timeline: t, checks };
}

module.exports = { render, plan, retimeOpening, spokenMs };
