#!/usr/bin/env node
// node make.js <lesson-slug> [--no-audio] [--frames] [--mux-only]
//                             [--variant name] [--voice ash] [--style "how to read it"]
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { openStage, alignWords, OUT } = require("./stage");
const { Recorder } = require("./recorder");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const VALUE_FLAGS = ["--voice", "--style", "--variant", "--music"];
const slug = args.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(args[i - 1]));
if (!slug) {
  console.error("usage: node make.js <lesson-slug> [--no-audio] [--frames] [--mux-only] [--variant name] [--voice ash] [--style text]");
  process.exit(1);
}

const ROOT = process.env.LPM_LESSONS_DIR || path.join(os.homedir(), "Movies/lpm-lessons");
const DIR = path.join(ROOT, slug);
const DEMO_URL = process.env.DEMO_URL || "http://localhost:3000/demo";
const MODEL = "gpt-4o-mini-tts";
const DEFAULT_VOICE = "marin";
const DEFAULT_STYLE =
  "Talk like a real person casually showing a colleague the app over their shoulder: relaxed, natural, everyday intonation with small pauses. Not a voiceover artist or announcer, no over-enunciation, moderate pace.";
const MUSIC_UNDER_VOICE_LU = 14;
const GAP_MS = 450;
const LEAD_MS = 500;
const SILENT_MS = 3000;
const TAIL_MS = 1800;

const lesson = JSON.parse(fs.readFileSync(path.join(DIR, "lesson.json"), "utf8"));
const beats = require(path.join(DIR, "beats.js"));
const VOICE = opt("--voice", lesson.voice || DEFAULT_VOICE);
const TTS_STYLE = opt("--style", lesson.style || DEFAULT_STYLE);
const variant = opt("--variant", null);
const outDir = variant ? path.join(DIR, "variants") : DIR;
const stem = variant ? variant : slug;
const audioDir = variant ? path.join(DIR, "audio", variant) : path.join(DIR, "audio");
const framesDir = path.join(outDir, variant ? `${variant}.frames` : "frames");
const raw = path.join(outDir, variant ? `${variant}.record.mkv` : "record.mkv");
const timelineFile = path.join(outDir, variant ? `${variant}.timeline.json` : "timeline.json");
const mp4 = path.join(outDir, `${stem}.mp4`);
const music = flag("--no-music")
  ? null
  : opt("--music", lesson.music === false ? null : lesson.music || process.env.LPM_LESSON_MUSIC || path.join(ROOT, "_music", "bed.mp3"));
fs.mkdirSync(audioDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  return execFileSync("security", ["find-generic-password", "-s", "lpm-video", "-a", "openai", "-w"], {
    encoding: "utf8",
  }).trim();
}

function durationMs(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  return Math.round(parseFloat(out) * 1000);
}

const spoken = (text) => text.replace(/\blpm\b/g, "LPM");

async function tts(line, fresh = false) {
  const wav = path.join(audioDir, `${line.id}.wav`);
  const stamp = path.join(audioDir, `${line.id}.txt`);
  const key = `${MODEL}/${VOICE}\n${TTS_STYLE}\n${spoken(line.text)}`;
  if (!fresh && fs.existsSync(wav) && fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === key) return wav;
  fs.rmSync(path.join(audioDir, `${line.id}.words.json`), { force: true });
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      voice: VOICE,
      input: spoken(line.text),
      instructions: TTS_STYLE,
      response_format: "wav",
    }),
  });
  if (!res.ok) throw new Error(`tts ${line.id}: ${res.status} ${await res.text()}`);
  fs.writeFileSync(wav, Buffer.from(await res.arrayBuffer()));
  fs.writeFileSync(stamp, key);
  return wav;
}

// Word onsets, so a beat can land a click on the word that asks for it.
async function words(line, wav) {
  const file = path.join(audioDir, `${line.id}.words.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("file", new Blob([fs.readFileSync(wav)], { type: "audio/wav" }), `${line.id}.wav`);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`words ${line.id}: ${res.status} ${await res.text()}`);
  const out = ((await res.json()).words || []).map((w) => ({ word: w.word, start: w.start, end: w.end }));
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

// The TTS model sometimes swallows a short closing sentence; a clip has to
// carry every word (in particular the last ones) or it is spoken again.
function missingWords(line, words) {
  const { all, times } = alignWords(line.text, words);
  const missed = all.filter((_, i) => times[i] == null);
  const tailLost = times.slice(-2).some((t) => t == null);
  return missed.length > all.length * 0.15 || tailLost ? missed : [];
}

async function speak(line) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const wav = await tts(line, attempt > 1);
    const w = await words(line, wav);
    const missed = missingWords(line, w);
    if (!missed.length) return { wav, words: w };
    console.log(`audio ${line.id}: clip missed "${missed.join(" ")}", speaking again (${attempt}/3)`);
  }
  throw new Error(`audio ${line.id}: the voice keeps dropping words; rephrase the line`);
}

async function prepareAudio() {
  const lines = [];
  for (const line of lesson.narration) {
    if (!line.text) {
      lines.push({ ...line, ms: line.ms ?? SILENT_MS, silent: true });
      continue;
    }
    if (flag("--no-audio")) {
      const words = line.text.split(/\s+/).length;
      lines.push({ ...line, ms: words * 370 + 500 });
      continue;
    }
    const { wav, words: w } = await speak(line);
    lines.push({ ...line, wav, ms: durationMs(wav), words: w });
    console.log(`audio ${line.id}: ${(lines.at(-1).ms / 1000).toFixed(2)}s`);
  }
  return lines;
}

async function record(lines) {
  if (flag("--frames")) {
    fs.rmSync(framesDir, { recursive: true, force: true });
    fs.mkdirSync(framesDir, { recursive: true });
  }
  const { stage, page, close } = await openStage({
    url: DEMO_URL,
    framesDir: flag("--frames") ? framesDir : null,
    log: (m) => console.log(`  ${((Date.now() - t0) / 1000).toFixed(2)}s ${m}`),
  });
  let t0 = Date.now();
  await stage.frame("stage");
  await stage.cover();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const rec = new Recorder(raw);
  await page.screencast.start({ size: OUT, quality: 92, onFrame: (f) => rec.frame(f) });
  const startedAt = Date.now();
  for (let n = 0; !rec.started && Date.now() - startedAt < 5000; n++) {
    await stage.repaint(n);
    await stage.hold(20);
  }
  if (!rec.started) throw new Error("screencast never moved past its first frame");
  t0 = rec.startWall;
  await stage.hold(LEAD_MS);
  const timeline = [];
  for (const [i, line] of lines.entries()) {
    const beat = beats[line.id];
    if (!beat) throw new Error(`no beat for narration line "${line.id}"`);
    const startMs = Date.now() - t0;
    console.log(`beat ${line.id} @ ${(startMs / 1000).toFixed(2)}s`);
    stage.beginLine(line);
    await beat(stage, line);
    if (process.env.DEBUG_CARD) console.log(`  card after ${line.id}:`, JSON.stringify(await stage.cardState()));
    if (i === 0 && (await stage.isCovered())) await stage.reveal();
    await stage.frame(line.id);
    const rest = startMs + line.ms + GAP_MS - (Date.now() - t0);
    if (rest > 0) await stage.hold(rest);
    timeline.push({ id: line.id, startMs, ms: line.ms });
  }
  await stage.hold(TAIL_MS);
  if (process.env.DEBUG_CARD) console.log("  card at end:", JSON.stringify(await stage.cardState()));
  await stage.frame("end");
  const totalMs = Date.now() - t0;
  await page.screencast.stop();
  await rec.stop(totalMs);
  await close();
  fs.writeFileSync(timelineFile, JSON.stringify({ totalMs, lines: timeline }, null, 2));
  console.log(`recorded ${(totalMs / 1000).toFixed(1)}s (${VOICE}) -> ${raw}`);
}

// Integrated loudness (LUFS) of a file, or of a filter graph's [out] label.
function lufs(inputs, filter) {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", ...inputs, ...(filter ? ["-filter_complex", `${filter};[out]ebur128=framelog=quiet[m]`, "-map", "[m]"] : ["-af", "ebur128=framelog=quiet"]), "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const m = /I:\s+(-?[\d.]+) LUFS/.exec(r.stderr.split("Summary").pop() || "");
  if (!m) throw new Error(`loudness measurement failed:\n${r.stderr.slice(-800)}`);
  return parseFloat(m[1]);
}

function mux(lines) {
  const { totalMs, lines: timeline } = JSON.parse(fs.readFileSync(timelineFile, "utf8"));
  const inputs = ["-i", raw];
  const delays = [];
  const labels = [];
  for (const t of timeline) {
    const line = lines.find((l) => l.id === t.id);
    if (line.silent) continue;
    const n = labels.length;
    inputs.push("-i", line.wav);
    delays.push(`[${n + 1}]adelay=${t.startMs}|${t.startMs}[a${n}]`);
    labels.push(`[a${n}]`);
  }
  const voice = `${delays.join(";")};${labels.join("")}amix=inputs=${labels.length}:normalize=0:dropout_transition=0`;
  let filter = `${voice},apad[a]`;
  const bed = music && fs.existsSync(music) ? music : null;
  if (music && !bed) console.log(`no music: ${music} is missing`);
  if (bed) {
    // The bed sits a fixed distance under the narration's own loudness, ducks
    // further while a line is spoken, and fades over the opening and closing cards.
    const voiceLufs = lufs(inputs.slice(2), voice.replace(/\[(\d+)\]adelay/g, (_, i) => `[${i - 1}]adelay`) + "[out]");
    const gainDb = voiceLufs - MUSIC_UNDER_VOICE_LU - lufs(["-i", bed]);
    const T = (totalMs / 1000).toFixed(3);
    const m = inputs.length / 2;
    inputs.push("-stream_loop", "-1", "-i", bed);
    filter =
      `${voice},apad,asplit=2[v1][v2];` +
      `[${m}]atrim=0:${T},volume=${gainDb.toFixed(1)}dB,afade=t=in:st=0:d=2.5,afade=t=out:st=${(totalMs / 1000 - 2).toFixed(3)}:d=2[m0];` +
      `[m0][v2]sidechaincompress=threshold=0.03:ratio=4:attack=150:release=600[m1];` +
      `[v1][m1]amix=inputs=2:normalize=0:dropout_transition=0,apad[a]`;
    console.log(`music: ${path.basename(bed)} at ${gainDb.toFixed(1)} dB (voice ${voiceLufs.toFixed(1)} LUFS)`);
  }
  const argv = [
    "-y", ...inputs,
    "-filter_complex", filter,
    "-map", "0:v", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "192k",
    "-t", (totalMs / 1000).toFixed(3),
    "-movflags", "+faststart",
    mp4,
  ];
  const r = spawnSync("ffmpeg", argv, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr.slice(-2000)}`);
  console.log(`muxed -> ${mp4}`);
}

(async () => {
  const lines = await prepareAudio();
  if (!flag("--mux-only")) await record(lines);
  if (!flag("--no-audio")) mux(lines);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
