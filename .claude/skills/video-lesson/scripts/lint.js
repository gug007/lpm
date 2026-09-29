// Checks a lesson's script before anything is spoken or launched: every line
// has a beat, every cue word is in its line, and the narration keeps the
// series' rules. A mistake here used to surface minutes into a take.
const fs = require("fs");
const path = require("path");
const { norm, findPhrase } = require("./words");

const TEASER = /\b(next (lesson|video|episode)|in the next (one|part)|coming up next|see you (next|in the next)|stay tuned)\b/i;
const CUE = /\b(cue|until)\s*:\s*(["'`])((?:(?!\2)[^\\\n])+)\2/g;
const CUE_MS = /\bcueMs\(\s*(["'`])((?:(?!\1)[^\\\n])+)\1/g;

function cuesIn(fn) {
  const src = fn.toString();
  const out = [];
  for (const m of src.matchAll(CUE)) out.push({ phrase: m[3], at: m.index });
  for (const m of src.matchAll(CUE_MS)) out.push({ phrase: m[2], at: m.index });
  return out.filter((c) => !c.phrase.includes("${")).sort((a, b) => a.at - b.at);
}

const sentences = (text) => (text.match(/[^.!?]+[.!?]*/g) || []).map((x) => x.trim()).filter(Boolean);

// `kind` is "landscape" (video-lesson) or "vertical" (tiktok-video-lesson).
function checkLesson(lesson, beats, { kind = "landscape" } = {}) {
  const errors = [];
  const warnings = [];
  if (!lesson.title) errors.push("lesson.json has no title");
  const narration = Array.isArray(lesson.narration) ? lesson.narration : [];
  if (!narration.length) errors.push("lesson.json has no narration lines");
  const seen = new Set();
  for (const line of narration) {
    if (!line.id) errors.push(`a narration line has no id: ${JSON.stringify(line).slice(0, 60)}`);
    else if (seen.has(line.id)) errors.push(`narration id "${line.id}" is used twice`);
    seen.add(line.id);
    if (line.id === "setup") errors.push('a narration line is called "setup", the name of the hook that seeds the lesson; rename it');
    if (!line.text && line.ms == null) warnings.push(`line "${line.id}" has neither text nor ms; it will be a 3 s pause`);
    if (/\bTODO\b/.test(`${line.text || ""} ${line.chapter || ""}`)) errors.push(`line "${line.id}" still has a TODO placeholder`);
  }
  for (const line of narration) {
    const beat = beats[line.id];
    if (typeof beat !== "function") {
      errors.push(`no beat for narration line "${line.id}"`);
      continue;
    }
    const all = norm(line.text || "");
    let last = -1;
    for (const { phrase } of cuesIn(beat)) {
      const want = norm(phrase);
      const at = findPhrase(all, want);
      if (!line.text) {
        errors.push(`beat "${line.id}" waits for "${phrase}", but its line is silent`);
        continue;
      }
      if (at < 0) {
        errors.push(`beat "${line.id}": cue "${phrase}" is not in its line ("${line.text}")`);
        continue;
      }
      if (findPhrase(all, want, at + 1) >= 0) warnings.push(`beat "${line.id}": cue "${phrase}" occurs more than once in its line; the first one is used`);
      if (at < last) warnings.push(`beat "${line.id}": cue "${phrase}" comes earlier in the line than the cue before it, so it fires at once`);
      last = Math.max(last, at);
    }
  }
  for (const [id, fn] of Object.entries(beats)) {
    if (id !== "setup" && typeof fn === "function" && !seen.has(id)) warnings.push(`beat "${id}" has no narration line and never runs`);
  }
  for (const line of narration) {
    if (!line.text) continue;
    if (kind === "landscape" && TEASER.test(line.text)) errors.push(`line "${line.id}" points at another video ("${line.text.match(TEASER)[0]}"); each lesson stands alone`);
    const parts = sentences(line.text);
    const lastSentence = parts.at(-1) || "";
    if (kind === "landscape" && parts.length > 1 && norm(lastSentence).length <= 2) {
      warnings.push(`line "${line.id}" ends on a very short sentence ("${lastSentence}"); the voice tends to drop those, fold it into the one before`);
    }
  }
  if (kind === "landscape" && narration.length) {
    const first = beats[narration[0].id];
    if (typeof first === "function" && !/\.card\(/.test(first.toString())) warnings.push(`the first beat ("${narration[0].id}") shows no title card; lessons open on s.card("<title>")`);
    const end = narration.at(-1);
    const endBeat = beats[end.id];
    if (end.text || (typeof endBeat === "function" && !/card\(\s*["'`]lpm\.cx/.test(endBeat.toString()))) {
      warnings.push(`the last line should be silent ({ "id": "outro", "ms": 3200 }) with s.card("lpm.cx", { hold: true })`);
    }
  }
  if (kind === "vertical") {
    for (const line of narration) {
      const fn = beats[line.id];
      if (typeof fn === "function" && /\bs\.card\(/.test(fn.toString())) errors.push(`beat "${line.id}" calls s.card(), which a vertical lesson does not have (the opener is the headline sticker)`);
    }
  }
  if (/\bTODO\b/.test(JSON.stringify(lesson.youtube || {}))) warnings.push('lesson.json "youtube" still has TODO placeholders; the upload refuses them');
  for (const [id, edit] of Object.entries(lesson.zooms || {})) {
    const bad = Object.keys(edit).filter((k) => !["scale", "at", "ms", "drop"].includes(k));
    if (!/^[^#]+#\d+$/.test(id)) errors.push(`lesson.json zooms: "${id}" is not a zoom id (<line>#<n>, see the mux log)`);
    if (bad.length) errors.push(`lesson.json zooms["${id}"]: unknown ${bad.join(", ")} (scale, at, ms or drop)`);
  }
  return { errors, warnings };
}

// Loads the lesson folder's lesson.json and beats.js and checks them.
function lintDir(dir, opts) {
  const lesson = JSON.parse(fs.readFileSync(path.join(dir, "lesson.json"), "utf8"));
  let beats;
  try {
    beats = require(path.join(dir, "beats.js"));
  } catch (e) {
    return { errors: [`beats.js does not load: ${e.message.split("\n")[0]}`], warnings: [] };
  }
  return checkLesson(lesson, beats, opts);
}

module.exports = { checkLesson, lintDir, cuesIn };
