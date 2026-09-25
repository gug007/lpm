// The soundtrack: every narration clip on its slot, over an optional music bed
// that sits a fixed distance under the voice's own loudness and ducks further
// while a line is spoken.
const path = require("path");
const { spawnSync } = require("child_process");

// Integrated loudness (LUFS) of a filter graph's [out] label over `inputs`.
function lufs(inputs, filter) {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", ...inputs, "-filter_complex", `${filter};[out]ebur128=framelog=quiet[m]`, "-map", "[m]", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const m = /I:\s+(-?[\d.]+) LUFS/.exec(r.stderr.split("Summary").pop() || "");
  if (!m) throw new Error(`loudness measurement failed:\n${r.stderr.slice(-800)}`);
  return parseFloat(m[1]);
}

// The narration bus: every clip delayed to its slot, summed. `base` is the
// ffmpeg input index of the first clip.
function voiceGraph(clips, base) {
  const delays = clips.map((c, n) => `[${base + n}]adelay=${c.startMs}|${c.startMs}[a${n}]`);
  const labels = clips.map((_, n) => `[a${n}]`).join("");
  return `${delays.join(";")};${labels}amix=inputs=${clips.length}:normalize=0:dropout_transition=0`;
}

// ffmpeg inputs (clips first, then the bed) and the audio half of the filter
// graph, ending in [a]. `clips` are { wav, startMs }; `base` is the input index
// the first clip will get.
function soundtrack({ clips, base, bed, totalMs, underLu, fadeInS, fadeOutS, log = console.log }) {
  const inputs = clips.flatMap((c) => ["-i", c.wav]);
  const voice = voiceGraph(clips, base);
  if (!bed) return { inputs, filter: `${voice},apad[a]` };
  const voiceLufs = lufs(inputs, voiceGraph(clips, 0) + "[out]");
  const gainDb = voiceLufs - underLu - lufs(["-i", bed], "[0:a]anull[out]");
  const T = (totalMs / 1000).toFixed(3);
  const m = base + clips.length;
  inputs.push("-stream_loop", "-1", "-i", bed);
  const filter =
    `${voice},apad,asplit=2[v1][v2];` +
    `[${m}]atrim=0:${T},volume=${gainDb.toFixed(1)}dB,afade=t=in:st=0:d=${fadeInS},afade=t=out:st=${(totalMs / 1000 - fadeOutS).toFixed(3)}:d=${fadeOutS}[m0];` +
    `[m0][v2]sidechaincompress=threshold=0.03:ratio=4:attack=150:release=600[m1];` +
    `[v1][m1]amix=inputs=2:normalize=0:dropout_transition=0,apad[a]`;
  log(`music: ${path.basename(bed)} at ${gainDb.toFixed(1)} dB (voice ${voiceLufs.toFixed(1)} LUFS)`);
  return { inputs, filter };
}

module.exports = { lufs, voiceGraph, soundtrack };
