#!/usr/bin/env node
// node captions.js <lesson folder>
// Subtitles from the script itself, timed by the word onsets the pipeline
// already has: the words are exactly what was written ("lpm", "Claude Code",
// "Codex"), where YouTube's own recognition hears "LPM", "cloud" and "codecs".
const fs = require("fs");
const path = require("path");
const { norm, onsets } = require("./words");

const LINE_CHARS = 42;
const CUE_CHARS = LINE_CHARS * 2;
const CUE_MS = 6000;
const PAUSE_MS = 650;
const TAIL_MS = 300;
const MIN_MS = 700;
const SHORT_MS = 1500;

// The words of one narration line as written, each with its onset (ms into
// the clip); punctuation-only tokens ride on the word before.
function wordsOf(line) {
  const text = line.text.replace(/\*/g, "");
  const at = onsets(text, line.words, line.ms);
  const out = [];
  let k = 0;
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    const parts = norm(raw).length;
    if (!parts) {
      if (out.length) out.at(-1).text += ` ${raw}`;
      continue;
    }
    out.push({ text: raw, ms: at[k] });
    k += parts;
  }
  return out;
}

// Words a line must not end on: "lpm / Link", "Set / up", "the / Mac".
const CLINGS = new Set(["lpm", "a", "an", "the", "to", "of", "on", "in", "at", "by", "your", "its", "and", "or", "so", "set", "sign", "take", "turn", "up", "can", "will", "you", "same", "really"]);
// …nor start on the particle of a phrasal verb ("plugged / in", "shows / up").
const PARTICLES = new Set(["in", "up", "out", "on", "off", "down", "over", "back"]);
const capital = (w) => /^[A-Z]/.test(w);

// Two balanced lines when the text is longer than one, broken after a
// comma when one is near the middle and never inside a name or a label
// ("Claude Code", "Set up Built-in Tailscale").
function wrap(text) {
  if (text.length <= LINE_CHARS) return text;
  const mid = text.length / 2;
  let best = -1;
  let bestCost = Infinity;
  for (let i = text.indexOf(" "); i >= 0; i = text.indexOf(" ", i + 1)) {
    const before = text.slice(0, i).split(" ").at(-1);
    const after = text.slice(i + 1).split(" ")[0];
    let cost = Math.abs(i - mid);
    if (Math.max(i, text.length - i - 1) > LINE_CHARS) cost += 100;
    if (/[,;:.!?]["')]?$/.test(before)) cost -= 10;
    if (CLINGS.has(before.toLowerCase().replace(/[^a-z]/g, ""))) cost += 30;
    if (capital(before) && capital(after) && !/[,;:.!?]$/.test(before)) cost += 30;
    if (/['’]s$/.test(before)) cost += 30;
    if (PARTICLES.has(after.replace(/[^a-z]/gi, "").toLowerCase()) && /^[a-z]/.test(before)) cost += 30;
    if (cost < bestCost) [best, bestCost] = [i, cost];
  }
  return best < 0 ? text : `${text.slice(0, best)}\n${text.slice(best + 1)}`;
}

function lineCues(line, startMs, limitMs) {
  const words = wordsOf(line);
  if (!words.length) return [];
  const lastWord = (line.words || []).at(-1);
  const spokenEnd = startMs + (lastWord ? lastWord.end * 1000 : line.ms) + TAIL_MS;
  const groups = [];
  let cur = [];
  for (const w of words) {
    if (cur.length) {
      const prev = cur.at(-1);
      const text = cur.map((x) => x.text).join(" ");
      const breakAfter = /[.!?]["')]?$/.test(prev.text) || (/[,;:]$/.test(prev.text) && text.length >= 30);
      const paused = w.ms - prev.ms > PAUSE_MS && text.length >= 24;
      const full = text.length + 1 + w.text.length > CUE_CHARS || w.ms - cur[0].ms > CUE_MS;
      // A full cue splits at its last comma rather than orphaning a tail.
      const comma = full ? cur.map((x) => /[,;:]$/.test(x.text)).lastIndexOf(true) : -1;
      if (comma >= 0 && comma < cur.length - 1) {
        groups.push(cur.slice(0, comma + 1));
        cur = cur.slice(comma + 1);
      } else if (breakAfter || paused || full) {
        groups.push(cur);
        cur = [];
      }
    }
    cur.push(w);
  }
  if (cur.length) groups.push(cur);
  // A scrap of a cue ("So,") reads better joined to the words after it.
  for (let i = 0; i + 1 < groups.length; i++) {
    const a = groups[i].map((x) => x.text).join(" ");
    const b = groups[i + 1].map((x) => x.text).join(" ");
    const span = groups[i + 1].at(-1).ms - groups[i][0].ms;
    if (a.length < 12 && a.length + 1 + b.length <= CUE_CHARS && span <= CUE_MS) {
      groups.splice(i, 2, [...groups[i], ...groups[i + 1]]);
      i--;
    }
  }
  // A cue that would flash by ("so tap it.", "Get it from the App Store.")
  // joins the one before it, or else the one after, when the two still fit.
  const text = (g) => g.map((x) => x.text).join(" ");
  const shown = (i) => (i + 1 < groups.length ? groups[i + 1][0].ms : lastWord ? lastWord.end * 1000 : line.ms) - groups[i][0].ms;
  const fits = (a, b) => text(a).length + 1 + text(b).length <= CUE_CHARS && b.at(-1).ms - a[0].ms <= CUE_MS;
  for (let i = 0; i < groups.length && groups.length > 1; i++) {
    if (shown(i) >= SHORT_MS && text(groups[i]).length >= 12) continue;
    if (i > 0 && fits(groups[i - 1], groups[i])) {
      groups.splice(i - 1, 2, [...groups[i - 1], ...groups[i]]);
      i -= 2;
    } else if (i + 1 < groups.length && fits(groups[i], groups[i + 1])) {
      groups.splice(i, 2, [...groups[i], ...groups[i + 1]]);
      i -= 1;
    }
  }
  return groups.map((g, i) => {
    const start = startMs + g[0].ms;
    const end = i + 1 < groups.length ? startMs + groups[i + 1][0].ms : Math.min(spokenEnd, limitMs);
    return { startMs: Math.round(start), endMs: Math.round(Math.max(end, start + MIN_MS)), text: wrap(g.map((w) => w.text).join(" ")) };
  });
}

// `timeline` is the take's; `lines` carry text, words and ms (voice.prepare).
function buildCues(timeline, lines) {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const cues = [];
  timeline.lines.forEach((t, i) => {
    const line = byId.get(t.id);
    if (!line || !line.text || line.silent) return;
    const next = timeline.lines[i + 1];
    cues.push(...lineCues(line, t.startMs, next ? next.startMs : timeline.totalMs));
  });
  for (let i = 0; i + 1 < cues.length; i++) cues[i].endMs = Math.min(cues[i].endMs, cues[i + 1].startMs);
  return cues.filter((c) => c.endMs > c.startMs);
}

const clock = (ms) => {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const two = (n) => String(n).padStart(2, "0");
  return `${two(h)}:${two(m)}:${two(s)},${String(t % 1000).padStart(3, "0")}`;
};

const toSrt = (cues) => cues.map((c, i) => `${i + 1}\n${clock(c.startMs)} --> ${clock(c.endMs)}\n${c.text}\n`).join("\n");

function writeCaptions(file, timeline, lines) {
  const cues = buildCues(timeline, lines);
  fs.writeFileSync(file, toSrt(cues));
  return cues.length;
}

// The lines of a lesson folder as the mux sees them, read from disk only.
function linesFromDisk(dir, lesson, audioDir = path.join(dir, "audio")) {
  return lesson.narration.map((n) => {
    const words = path.join(audioDir, `${n.id}.words.json`);
    const t = n.text ? JSON.parse(fs.readFileSync(words, "utf8")) : [];
    return { ...n, words: t, silent: !n.text };
  });
}

module.exports = { buildCues, toSrt, writeCaptions, linesFromDisk, wrap };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || "");
  if (!process.argv[2] || !fs.existsSync(path.join(dir, "timeline.json"))) {
    console.error("usage: node captions.js <lesson folder with a take>");
    process.exit(2);
  }
  const lesson = JSON.parse(fs.readFileSync(path.join(dir, "lesson.json"), "utf8"));
  const timeline = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
  const lines = linesFromDisk(dir, lesson).map((l) => ({ ...l, ms: timeline.lines.find((t) => t.id === l.id)?.ms ?? 0 }));
  const file = path.join(dir, `${path.basename(dir)}.srt`);
  console.log(`${writeCaptions(file, timeline, lines)} captions -> ${file}`);
}
