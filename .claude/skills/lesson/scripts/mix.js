// The soundtrack: every narration clip on its slot, over an optional music bed
// that sits a fixed distance under the voice's own loudness and ducks further
// while a line is spoken, mastered to a set loudness (YouTube plays anything
// quieter than its -14 LUFS reference as it is and never turns it up).
const fs = require("fs");
const path = require("path");
const { loudness, lufs, brightness } = require("./loudness");

// Downloaded by preflight.js from music/tracks.json; the licence allows it in
// videos but not in the repo.
const DEFAULT_BED = path.join(__dirname, "..", "music", "bed.mp3");
const RATE = 48000;
const MASTER = { lufs: -14, peak: -1.5 };
const LEVEL_FROM_LU = 1.5;
const LEVEL_MAX_DB = 4;
const SHELF_MAX_DB = 4;

const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));
const db = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;

// A clip's loudness, cached beside it (keyed on its size and time) so a re-cut
// measures only what changed.
function clipLufs(wav) {
  const cache = wav.replace(/\.wav$/, ".lufs.json");
  const st = fs.statSync(wav);
  const key = `${st.size}:${Math.round(st.mtimeMs)}`;
  try {
    const c = JSON.parse(fs.readFileSync(cache, "utf8"));
    if (c.key === key) return c.lufs;
  } catch {
    // not measured yet
  }
  const v = lufs(["-i", wav], "[0:a]anull[out]");
  try {
    fs.writeFileSync(cache, JSON.stringify({ key, lufs: v }));
  } catch {
    // a read-only lesson folder only costs the next re-cut a measurement
  }
  return v;
}

// Lines TTS returned noticeably quieter or louder than the lesson's median
// ("Drafts." came back 4.8 LU under) are brought toward it.
function levelClips(clips, log) {
  const measured = clips.map((c) => clipLufs(c.wav));
  const usable = measured.filter((v) => Number.isFinite(v) && v > -60).sort((a, b) => a - b);
  if (usable.length < 3) return clips;
  const median = usable[Math.floor(usable.length / 2)];
  const moved = [];
  const out = clips.map((c, i) => {
    const d = median - measured[i];
    if (!Number.isFinite(d) || measured[i] <= -60 || Math.abs(d) < LEVEL_FROM_LU) return c;
    const gainDb = clamp(d, LEVEL_MAX_DB);
    moved.push(`${c.id || path.basename(c.wav, ".wav")} ${db(gainDb)} dB`);
    return { ...c, gainDb };
  });
  if (moved.length) log(`voice: levelled ${moved.length} clip(s) toward ${median.toFixed(1)} LUFS: ${moved.join(", ")}`);
  return out;
}

// The narration bus, mono: every clip delayed to its slot, summed. `base` is
// the ffmpeg input index of the first clip.
function voiceGraph(clips, base) {
  const chains = clips.map((c, n) => {
    const gain = c.gainDb ? `volume=${c.gainDb.toFixed(2)}dB,` : "";
    return `[${base + n}]${gain}aresample=${RATE},adelay=${c.startMs}|${c.startMs}[a${n}]`;
  });
  const labels = clips.map((_, n) => `[a${n}]`).join("");
  return `${chains.join(";")};${labels}amix=inputs=${clips.length}:normalize=0:dropout_transition=0`;
}

// ffmpeg inputs (clips first, then the bed) and the audio half of the filter
// graph, ending in [a], stereo at 48 kHz. `clips` are { wav, startMs, id? };
// `base` is the input index the first clip will get. `voice` shapes the
// narration first: `level` evens out clip loudness and `brightness` shelves
// the bus's treble onto a target (dB above 4 kHz against the whole band;
// lesson 02 is -16.5), so every lesson sounds like the same narrator.
function soundtrack({ clips, base, bed, totalMs, underLu, fadeInS, fadeOutS, voice = {}, master = MASTER, log = console.log }) {
  const T = (totalMs / 1000).toFixed(3);
  const shaped = voice.level ? levelClips(clips, log) : clips;
  const inputs = shaped.flatMap((c) => ["-i", c.wav]);
  let shelf = "";
  if (voice.brightness != null) {
    const was = brightness(inputs, voiceGraph(shaped, 0) + "[out]");
    const g = clamp(voice.brightness - was, SHELF_MAX_DB);
    if (Math.abs(g) >= 0.2) {
      shelf = `,treble=g=${g.toFixed(1)}:f=4000:width_type=q:w=0.7`;
      log(`voice: treble ${db(g)} dB (${was.toFixed(1)} -> ${voice.brightness.toFixed(1)} dB)`);
    }
  }
  const bus = (b) => `${voiceGraph(shaped, b)}${shelf},pan=stereo|c0=c0|c1=c0`;
  let mix;
  if (!bed) {
    mix = (b) => `${bus(b)},apad=whole_dur=${T}[mix]`;
  } else {
    const voiceLufs = lufs(inputs, bus(0) + "[out]");
    const gainDb = voiceLufs - underLu - lufs(["-i", bed], "[0:a]anull[out]");
    log(`music: ${path.basename(bed)} at ${gainDb.toFixed(1)} dB (voice ${voiceLufs.toFixed(1)} LUFS)`);
    inputs.push("-stream_loop", "-1", "-i", bed);
    mix = (b) => {
      const m = b + shaped.length;
      return (
        `${bus(b)},apad=whole_dur=${T},asplit=2[v1][v2];` +
        `[${m}]aresample=${RATE},aformat=channel_layouts=stereo,atrim=0:${T},volume=${gainDb.toFixed(1)}dB,` +
        `afade=t=in:st=0:d=${fadeInS},afade=t=out:st=${(totalMs / 1000 - fadeOutS).toFixed(3)}:d=${fadeOutS}[m0];` +
        `[m0][v2]sidechaincompress=threshold=0.03:ratio=4:attack=150:release=600[m1];` +
        `[v1][m1]amix=inputs=2:normalize=0:dropout_transition=0,atrim=0:${T}[mix]`
      );
    };
  }
  if (!master) return { inputs, filter: `${mix(base)};[mix]apad[a]` };
  // The gain goes on after the bed is mixed: the ducking keys off the voice
  // at a fixed threshold, so a louder voice before it would duck deeper.
  const limit = Math.pow(10, (master.peak - 0.5) / 20);
  const chain = (g) => `volume=${g.toFixed(2)}dB,aresample=${RATE * 4},alimiter=limit=${limit.toFixed(4)}:level=0:latency=1,aresample=${RATE}`;
  const before = loudness(inputs, mix(0) + ";[mix]anull[out]");
  let gain = master.lufs - before.lufs;
  let after = loudness(inputs, `${mix(0)};[mix]${chain(gain)}[out]`);
  if (Math.abs(after.lufs - master.lufs) > 0.3) {
    gain += master.lufs - after.lufs;
    after = loudness(inputs, `${mix(0)};[mix]${chain(gain)}[out]`);
  }
  log(`master: ${before.lufs.toFixed(1)} -> ${after.lufs.toFixed(1)} LUFS (gain ${db(gain)} dB), true peak ${after.peak} dBTP`);
  return { inputs, filter: `${mix(base)};[mix]${chain(gain)},apad[a]` };
}

module.exports = { DEFAULT_BED, MASTER, RATE, lufs, voiceGraph, soundtrack };
