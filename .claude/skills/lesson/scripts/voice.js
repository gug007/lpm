// Narration clips: one OpenAI speech clip per line, cached by model, voice,
// style and text, with Whisper word onsets so a beat can land an action on a
// spoken word (and a caption can light the word up).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { alignWords } = require("./words");

const MODEL = "gpt-4o-mini-tts";
const SILENT_MS = 3000;
// Lines voiced at once: each is a speech call and a transcription call, well
// under a paid account's per-minute limits.
const JOBS = 4;
const TRIES = 3;
const RETRY_AFTER_MAX_MS = 30000;
// How often a line over its `capMs` is spoken again for a shorter clip.
const CAP_RETRIES = 2;

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

// How long a rate-limited reply asks to wait, from its retry-after header.
function retryAfterMs(res) {
  const s = parseFloat(res.headers.get("retry-after"));
  return Number.isFinite(s) && s >= 0 ? Math.min(s * 1000, RETRY_AFTER_MAX_MS) : 0;
}

// A dropped connection, a 5xx or a rate limit (429) is tried again, a rate
// limit no sooner than its retry-after; anything else, an account out of
// credit included, is a real error. `waitMs` is the pause before attempt n+1.
async function post(url, init, label, { waitMs = (n) => 1500 * n } = {}) {
  for (let attempt = 1; ; attempt++) {
    let wait = waitMs(attempt);
    try {
      const res = await fetch(url, init);
      const limited = res.status === 429 && !(await res.clone().text()).includes("insufficient_quota");
      if ((res.status < 500 && !limited) || attempt === TRIES) return res;
      if (limited) wait = Math.max(wait, retryAfterMs(res));
      console.log(`${label}: ${res.status}${limited ? " (rate limited)" : ""}, trying again (${attempt}/${TRIES})`);
    } catch (e) {
      if (attempt === TRIES) throw e;
      console.log(`${label}: ${e.cause?.code || e.message}, trying again (${attempt}/${TRIES})`);
    }
    await new Promise((r) => setTimeout(r, wait));
  }
}

// `fn` over `items`, at most `limit` at a time, in their order. After a
// failure no new item starts and the running ones finish, so a clip already
// paid for still reaches the disk; then the first error is thrown.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  let failed = null;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch (e) {
        failed ??= { e };
      }
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  if (failed) throw failed.e;
  return out;
}

// What the voice is given for a line. The brand is read as letters, `*word*`
// marks a caption highlight and is never read aloud, and lesson.json
// "pronounce" swaps a word for how to say it (the captions keep the written one).
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function speaker(pronounce = {}) {
  const rules = Object.entries({ lpm: "LPM", ...pronounce }).map(([word, say]) => [new RegExp(`\\b${escapeRe(word)}\\b`, "g"), say]);
  return (text) => rules.reduce((t, [re, say]) => t.replace(re, say), text.replace(/\*/g, ""));
}

// `tempo` speeds a clip up after it is spoken (pitch kept), before its words
// are timed, so the onsets match what plays.
function makeVoice({ audioDir, voice, style, respeak = false, tempo = 1, pronounce }) {
  const spoken = speaker(pronounce);
  // The TTS model sometimes swallows a short closing sentence; a clip has to
  // carry every word (in particular the last ones) or it is spoken again.
  function missingWords(line, words) {
    const { all, times } = alignWords(spoken(line.text), words);
    const missed = all.filter((_, i) => times[i] == null);
    const tailLost = times.slice(-2).some((t) => t == null);
    return missed.length > all.length * 0.15 || tailLost ? missed : [];
  }
  fs.mkdirSync(audioDir, { recursive: true });
  const head = tempo === 1 ? `${MODEL}/${voice}` : `${MODEL}/${voice}@${tempo}`;
  const file = (line, ext) => path.join(audioDir, `${line.id}.${ext}`);
  const clipKey = (line) => `${head}\n${style}\n${spoken(line.text)}`;

  // The clip on disk that says the line as it stands, or null. One already
  // spoken for this text stays as it is even after the default style changes:
  // a re-spoken line has a different length and would desync the recorded
  // take. `respeak` re-speaks every line (and needs a new take).
  function cachedClip(line) {
    const wav = file(line, "wav");
    const stamp = file(line, "txt");
    if (!fs.existsSync(wav) || !fs.existsSync(stamp)) return null;
    const had = fs.readFileSync(stamp, "utf8");
    const key = clipKey(line);
    if (had === key) return { wav };
    const [hadHead, , ...hadText] = had.split("\n");
    const [head, , ...text] = key.split("\n");
    if (respeak || hadHead !== head || hadText.join("\n") !== text.join("\n")) return null;
    return { wav, otherStyle: true };
  }

  // `cachedOnly` (a re-cut) never calls the API: a line whose clip no longer
  // matches its text stops the run, since the new clip changes the timing.
  async function tts(line, { fresh = false, cachedOnly = false } = {}) {
    const clip = fresh ? null : cachedClip(line);
    if (clip?.otherStyle) console.log(`audio ${line.id}: keeping the clip spoken with the previous style (--respeak to re-speak)`);
    if (clip) return { wav: clip.wav, cached: true };
    if (cachedOnly) {
      throw new Error(`audio ${line.id}: the line has no clip for its current text; a re-cut never speaks (add --speak to speak it and check it still fits the take, or put the old text back)`);
    }
    fs.rmSync(file(line, "words.json"), { force: true });
    const res = await post("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        voice,
        input: spoken(line.text),
        instructions: style,
        response_format: "wav",
      }),
    }, `tts ${line.id}`);
    if (!res.ok) throw new Error(`tts ${line.id}: ${res.status} ${await res.text()}`);
    const wav = file(line, "wav");
    const audio = Buffer.from(await res.arrayBuffer());
    if (tempo === 1) {
      fs.writeFileSync(wav, audio);
    } else {
      const rawWav = file(line, "raw.wav");
      fs.writeFileSync(rawWav, audio);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", rawWav, "-filter:a", `atempo=${tempo}`, wav]);
      fs.rmSync(rawWav, { force: true });
    }
    fs.writeFileSync(file(line, "txt"), clipKey(line));
    return { wav, cached: false };
  }

  async function words(line, wav) {
    const timed = file(line, "words.json");
    if (fs.existsSync(timed)) return JSON.parse(fs.readFileSync(timed, "utf8"));
    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    form.append("file", new Blob([fs.readFileSync(wav)], { type: "audio/wav" }), `${line.id}.wav`);
    const res = await post("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}` },
      body: form,
    }, `words ${line.id}`);
    if (!res.ok) throw new Error(`words ${line.id}: ${res.status} ${await res.text()}`);
    const out = ((await res.json()).words || []).map((w) => ({ word: w.word, start: w.start, end: w.end }));
    fs.writeFileSync(timed, JSON.stringify(out));
    return out;
  }

  // The same text can come out a second longer from one clip to the next, and
  // a hook has no room for that: a line with `capMs` that runs over is spoken
  // again, and the shortest clip with every word in it is kept.
  async function underCap(line, wav, w) {
    if (!line.capMs) return { wav, words: w };
    const files = [wav, file(line, "words.json")];
    const clip = (words) => ({ ms: durationMs(wav), words, bytes: files.map((f) => fs.readFileSync(f)) });
    let best = clip(w);
    for (let n = 1; n <= CAP_RETRIES && best.ms > line.capMs; n++) {
      console.log(`audio ${line.id}: ${(best.ms / 1000).toFixed(2)}s, over ${(line.capMs / 1000).toFixed(1)}s; speaking again for a shorter clip (${n}/${CAP_RETRIES})`);
      await tts(line, { fresh: true });
      const again = await words(line, wav);
      if (!missingWords(line, again).length && durationMs(wav) < best.ms) best = clip(again);
    }
    files.forEach((f, i) => fs.writeFileSync(f, best.bytes[i]));
    return { wav, words: best.words };
  }

  // A clip that already carries the take's timing is never replaced because
  // the word check disagrees with it; only a fresh clip is spoken again.
  async function speak(line, cachedOnly) {
    const heard = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { wav, cached } = await tts(line, { fresh: attempt > 1 || (respeak && !cachedOnly), cachedOnly });
      const w = await words(line, wav);
      const missed = missingWords(line, w);
      if (!missed.length) return cached ? { wav, words: w } : underCap(line, wav, w);
      if (cached) {
        console.log(`audio ${line.id}: the transcript misses "${missed.join(" ")}"; keeping the clip the take was recorded with`);
        return { wav, words: w };
      }
      heard.push(w.map((x) => x.word).join(" "));
      console.log(`audio ${line.id}: clip missed "${missed.join(" ")}", speaking again (${attempt}/3)`);
    }
    throw new Error(`audio ${line.id}: the voice keeps dropping words; rephrase the line.\n  text:  ${spoken(line.text)}\n${heard.map((h, i) => `  try ${i + 1}: ${h}`).join("\n")}`);
  }

  // Every narration line as it will play, in order: a spoken clip with its
  // length and word onsets, or a silent pause. Two lines with one id would
  // share a clip's files, so they stop the run first. `dry` never speaks: a line
  // without a clip gets an estimated length; `cachedOnly` fails there instead.
  async function prepare(narration, { dry = false, cachedOnly = false } = {}) {
    const twice = narration.map((l) => l.id).filter((id, i, ids) => ids.indexOf(id) !== i);
    if (twice.length) throw new Error(`narration id "${twice[0]}" is used twice; every line needs its own`);
    return mapLimit(narration, JOBS, async (line) => {
      if (!line.text) return { ...line, ms: line.ms ?? SILENT_MS, silent: true };
      if (dry && !(cachedClip(line) && fs.existsSync(file(line, "words.json")))) {
        const count = line.text.split(/\s+/).length;
        return { ...line, ms: Math.round((count * 370) / tempo) + 500 };
      }
      const { wav, words: w } = await speak(line, cachedOnly || dry);
      const ms = durationMs(wav);
      console.log(`audio ${line.id}: ${(ms / 1000).toFixed(2)}s`);
      return { ...line, wav, ms, words: w };
    });
  }

  return { prepare };
}

module.exports = { makeVoice, durationMs, speaker, mapLimit, post, MODEL };
