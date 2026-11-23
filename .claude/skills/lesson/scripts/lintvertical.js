// What a vertical lesson's script must not get wrong (lint.js runs this for
// kind "vertical"): the copy, the payoff and cues the pointer can't reach.
const { norm, findPhrase } = require("./words");

const HOOK_WORDS = 9;
const MAX_LINES = 11;
const MAX_WORDS = 120;
const HEADLINE_WORDS = 9;
const MAX_HASHTAGS = 5;
const WEAK_HOOK = /^(in this (video|short|clip)|here'?s how|today|let me show|let'?s)\b/i;
// new.js's placeholders; a prompt a beat types may well say TODO.
const PLACEHOLDER = /\bTODO (selector|word)\b/;
const EMOJI = /\p{Extended_Pictographic}/gu;
// A pointer glide shorter than this can still land on a line's first word.
const QUICK_GLIDE_MS = 250;
const POINTER_CUE = /\bs\.(click|moveTo)\(((?:(?!\bs\.)[\s\S])*?)\bcue\s*:\s*(["'`])((?:(?!\3)[^\\\n])+)\3([^;]*)/g;

const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

// What the lines say; needs no beats, so it runs before the voice too.
function checkCopy(lesson, narration, errors, warnings) {
  const spoken = narration.filter((l) => l.text);
  const hook = spoken[0];
  const words = spoken.reduce((n, l) => n + wordCount(l.text), 0);
  if (words > MAX_WORDS) warnings.push(`the narration is ${words} words; over about 110 it runs past 45 s`);
  if (spoken.length > MAX_LINES) warnings.push(`${spoken.length} lines is a lot for one short; 6-9 hold attention`);
  if (hook) {
    if (wordCount(hook.text) > HOOK_WORDS) warnings.push(`the hook ("${hook.text}") is ${wordCount(hook.text)} words; it has to be over in 2.5 s`);
    if (WEAK_HOOK.test(hook.text.replace(/\*/g, ""))) warnings.push(`the hook ("${hook.text}") announces the video; open on the problem, the surprise or the result`);
  }
  for (const l of spoken) {
    if ((l.text.match(/\*/g) || []).length % 2) errors.push(`line "${l.id}" has an unpaired * (a highlight is *word*)`);
    const commas = (l.text.match(/,/g) || []).length;
    if (commas > 1) warnings.push(`line "${l.id}" has ${commas} commas, each an audible pause; use two short sentences`);
    if (/\bLPM\b/.test(l.text)) warnings.push(`line "${l.id}" writes LPM; write lpm (it is spoken as letters)`);
  }
  const headline = lesson.headline ?? hook?.headline;
  if (!headline) warnings.push("no headline: the first line's \"headline\" is the cover text");
  else {
    if (wordCount(headline.replace(EMOJI, "")) > HEADLINE_WORDS) warnings.push(`the headline ("${headline}") is long for a cover; 4-8 words read at feed size`);
    if ((headline.match(EMOJI) || []).length > 1) warnings.push(`the headline ("${headline}") has more than one emoji`);
  }
}

function checkPost(post, warnings) {
  if (!post?.caption) return warnings.push('no "post.caption": the post would carry the title alone');
  if (/@/.test(post.caption)) warnings.push("the post caption has an @, which opens the mention picker");
  if (/\bLPM\b/.test(post.caption)) warnings.push("the post caption writes LPM; the brand is lowercase lpm");
  const tags = (post.hashtags || []).map((t) => t.replace(/^#/, ""));
  if (tags.length > MAX_HASHTAGS) warnings.push(`${tags.length} hashtags; TikTok keeps ${MAX_HASHTAGS}, a 6th loses its #`);
  if (tags.length && !tags.includes("lpm")) warnings.push('the hashtags leave out "lpm"');
}

// `beats` are the beats.js exports.
function checkVertical(lesson, narration, beats, errors, warnings) {
  const open = lesson.open ?? 1;
  if (/\bTODO:/.test(JSON.stringify([lesson.headline, lesson.post, narration.map((l) => [l.headline, l.label])]))) errors.push("a headline, a label or the post still has a TODO placeholder");
  if (narration.length && open >= narration.length) errors.push(`lesson.json "open" is ${open}, but there are ${narration.length} lines: nothing is left after the opening`);
  checkPost(lesson.post, warnings);
  let payoff = false;
  narration.forEach((line, i) => {
    const fn = beats[line.id];
    if (typeof fn !== "function") return;
    const src = fn.toString();
    if (/\.payoff\(/.test(src)) payoff = true;
    if (/\bs\.card\(/.test(src)) errors.push(`beat "${line.id}" calls s.card(), which a vertical lesson does not have (the opener is the headline sticker)`);
    if (PLACEHOLDER.test(src)) errors.push(`beat "${line.id}" still has a TODO placeholder`);
    if (!line.text || i < open) return;
    for (const [, call, before, , phrase, after] of src.matchAll(POINTER_CUE)) {
      const ms = Number(/\bms\s*:\s*(\d+)/.exec(before + after)?.[1] ?? 600);
      if (ms > QUICK_GLIDE_MS && findPhrase(norm(line.text), norm(phrase)) === 0) {
        warnings.push(`beat "${line.id}": s.${call} on "${phrase}", the line's first word, lands ${(ms / 1000).toFixed(1)} s late; cue a later word, or move the pointer at the end of the line before`);
      }
    }
  });
  if (narration.length && !payoff && narration.every((l) => typeof beats[l.id] === "function")) {
    warnings.push("no beat calls s.payoff(), so the video opens on the take's last moments");
  }
}

module.exports = { checkCopy, checkVertical };
