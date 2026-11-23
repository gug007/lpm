const { clampScale } = require("./keyframes");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function spell(n) {
  if (n < 20) return [ONES[n]];
  if (n < 100) return n % 10 ? [TENS[Math.floor(n / 10)], ONES[n % 10]] : [TENS[n / 10]];
  if (n < 1000) return [ONES[Math.floor(n / 100)], "hundred", ...(n % 100 ? spell(n % 100) : [])];
  return [...spell(Math.floor(n / 1000)), "thousand", ...(n % 1000 ? spell(n % 1000) : [])];
}

// "eight" → "eighth": the last word of a spelled number, as an ordinal.
const ORDINAL_OF = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
const ordinalOf = (w) => ORDINAL_OF[w] || (w.endsWith("y") ? `${w.slice(0, -1)}ieth` : `${w}th`);

// Words as the transcript and the script both reduce to them: lowercase, no
// punctuation or accents, and numbers spelled out, so "96%" in one and
// "ninety-six percent" in the other are the same three words, and "всё" and
// "все" (or "café" and "cafe") are the same word. Every dot between digits
// splits them, so a version reads as its parts ("3.2.7": three two seven), and
// "5th" reads "fifth". A word spelled from digits keeps them (`digits`), and
// the words of one written number share an `id` (prefixed by `group`).
// Each word of the text reduces on its own, so the words of a text are those
// of its words in turn (captions.js counts on that).
const tokens = (t, group = "") =>
  t
    .toLowerCase()
    .replace(/%/g, " percent")
    .replace(/(\d)\.(?=\d)/g, "$1 ")
    .normalize("NFD")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w, i) => {
      const id = `${group}${i}`;
      if (/^\d{1,6}$/.test(w)) return spell(Number(w)).map((x) => ({ w: x, digits: w, id }));
      const ordinal = /^(\d{1,6})(?:st|nd|rd|th)$/.exec(w);
      if (ordinal) return spell(Number(ordinal[1])).map((x, k, all) => ({ w: k === all.length - 1 ? ordinalOf(x) : x, digits: ordinal[1], id }));
      if (/^\d+$/.test(w)) return [{ w, digits: w, id }];
      return [{ w }];
    });

const norm = (t) => tokens(t).map((x) => x.w);

// How the transcript tends to spell names the voice says right; lesson.json
// "heard" adds to them: a heard word for a written one ({ "sas": "sass" }), or
// either side a phrase ({ "muse wander": "muse wonder" }). Both sides reduce as
// words do.
const USUAL = { cloud: "claude", clod: "claude", clawd: "claude", clods: "claudes", clawed: "claude", codecs: "codex", codec: "codex", lpn: "lpm", kimmy: "kimi", kimmie: "kimi", abby: "obby", obi: "obby", obbie: "obby", hobby: "obby" };
let HEARD_AS = { ...USUAL };
let HEARD_PHRASES = [];
function setHeard(map = {}) {
  HEARD_AS = { ...USUAL };
  HEARD_PHRASES = [];
  for (const [k, v] of Object.entries(map)) {
    const h = norm(k);
    const w = norm(v);
    if (!h.length || !w.length) continue;
    if (h.length === 1 && w.length === 1) HEARD_AS[h[0]] = w[0];
    else HEARD_PHRASES.push({ h, w });
  }
}

// A "heard" phrase spoken at `k` that stands for the written words at `i`.
const heardPhrase = (spoken, k, all, i) =>
  HEARD_PHRASES.find(({ h, w }) => h.every((x, n) => spoken[k + n]?.w === x) && w.every((x, n) => all[i + n] === x));
const SOUND_ALIKE = [["to", "too", "two"], ["for", "four"]];
const same = (heard, word) =>
  heard === word ||
  HEARD_AS[heard] === word ||
  SOUND_ALIKE.some((set) => set.includes(heard) && set.includes(word)) ||
  (heard.endsWith("s") && word.endsWith("s") && heard.length > 3 && HEARD_AS[heard.slice(0, -1)] === word.slice(0, -1));

// What a number word is worth, cardinal or ordinal ("eighth" is an 8).
const NUMBER_WORDS = new Map();
for (const [i, w] of ONES.entries()) NUMBER_WORDS.set(w, { type: i === 0 ? "zero" : i < 10 ? "unit" : "teen", v: i });
for (const [i, w] of TENS.entries()) if (w) NUMBER_WORDS.set(w, { type: "tens", v: i * 10 });
NUMBER_WORDS.set("hundred", { type: "hundred", v: 100 });
NUMBER_WORDS.set("thousand", { type: "scale", v: 1000 });
NUMBER_WORDS.set("million", { type: "scale", v: 1e6 });
for (const [w, k] of [...NUMBER_WORDS]) if (k.type !== "zero") NUMBER_WORDS.set(ordinalOf(w), { ...k, ord: true });

// Whether a number word carries on the number so far: "twenty" then "six",
// "fifteen" then "hundred", but not "three" then "two" (a version's parts) or
// "twenty" then "twenty" (a year said in pairs).
function joins(cur, k) {
  if (cur.last === "a") return k?.type === "hundred" || k?.type === "scale";
  if (!k || k.type === "zero") return false;
  if (k.type === "unit") return ["tens", "hundred", "scale"].includes(cur.last);
  if (k.type === "teen" || k.type === "tens") return ["hundred", "scale"].includes(cur.last);
  if (k.type === "hundred") return cur.group > 0 && cur.group < 100;
  return cur.group > 0;
}

// The numbers in a run of words (tokens()), by the index they start at:
// { end, value, digits }. A number written in digits is one number; one in
// words is read as people say it ("fifteen hundred", "two thousand twenty
// six", "a hundred and five").
function numbersIn(toks) {
  const found = new Map();
  let cur = null;
  const close = (end) => {
    if (cur) found.set(cur.start, { end, value: cur.total + cur.group, digits: cur.digits || null });
    cur = null;
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (cur?.id != null && t.id === cur.id) continue;
    if (t.digits) {
      close(i);
      cur = { start: i, id: t.id, total: Number(t.digits), group: 0, digits: t.digits };
      continue;
    }
    const next = toks[i + 1];
    if (t.w === "a" && next && !next.digits && ["hundred", "scale"].includes(NUMBER_WORDS.get(next.w)?.type) && !NUMBER_WORDS.get(next.w).ord) {
      close(i);
      cur = { start: i, total: 0, group: 0, last: "a" };
      continue;
    }
    if (t.w === "and" && cur && cur.id == null && (cur.last === "hundred" || cur.last === "scale") && next && !next.digits && joins(cur, NUMBER_WORDS.get(next.w))) continue;
    const k = NUMBER_WORDS.get(t.w);
    if (!k) {
      close(i);
      continue;
    }
    if (!cur || cur.id != null || !joins(cur, k)) {
      close(i);
      cur = { start: i, total: 0, group: 0, last: null };
    }
    if (k.type === "hundred") cur.group = (cur.group || 1) * 100;
    else if (k.type === "scale") [cur.total, cur.group] = [cur.total + (cur.group || 1) * k.v, 0];
    else cur.group += k.v;
    cur.last = k.ord ? "ord" : k.type;
    if (cur.last === "ord" || cur.last === "zero") close(i + 1);
  }
  close(toks.length);
  return found;
}

// Where a spoken number starting at `k` and worth `value` ends, or null: the
// same number however it is written ("1500", "fifteen hundred", "1,500"), a
// cardinal for an ordinal ("Eighth," heard as "8"), or thousands the
// transcript split at their commas ("1,500" heard as "1" "500").
function numberEnd(value, nums, k) {
  const s = nums.get(k);
  if (!s) return null;
  if (s.value === value) return s.end;
  let { digits, end } = s;
  for (let next = nums.get(end); digits && next?.digits?.length === 3; next = nums.get(end)) {
    digits += next.digits;
    end = next.end;
    if (Number(digits) === value) return end;
  }
  return null;
}

// The words of a transcript, each with its onset. Whisper keeps the "%" of a
// number such as "75%" as an empty word after it; that word is the "percent".
function spokenWords(words = []) {
  const spoken = [];
  let afterNumber = false;
  for (const [i, w] of words.entries()) {
    const parts = tokens(w.word || "", `${i}:`);
    if (!parts.length && afterNumber && !(w.word || "").trim()) parts.push({ w: "percent" });
    for (const p of parts) spoken.push({ ...p, ms: w.start * 1000, src: i });
    afterNumber = parts.length > 0 && parts.at(-1).digits != null;
  }
  return spoken;
}

// Start time (ms) of each word of `text` in the clip, or null where the
// transcript has no match for it. A number is matched whole, by its value, so
// the way the transcript writes it doesn't matter; every word of it gets a
// time from the spoken number, in step where the two have as many words.
// `heardAt` holds the spoken words [from, to) each matched word took.
function alignWords(text, words) {
  const script = tokens(text);
  const all = script.map((t) => t.w);
  const spoken = spokenWords(words);
  const written = numbersIn(script);
  const said = numbersIn(spoken);
  const times = new Array(all.length).fill(null);
  const heardAt = new Array(all.length).fill(null);
  let i = 0;
  let j = 0;
  const match = (to, k, end, msOf = () => spoken[k].ms) => {
    for (let x = i; x < to; x++) [times[x], heardAt[x]] = [msOf(x), [k, end]];
    [i, j] = [to - 1, end];
    return true;
  };
  const matchAt = (k) => {
    const num = written.get(i);
    const end = num && numberEnd(num.value, said, k);
    if (end) return match(num.end, k, end, (x) => spoken[Math.min(k + (x - i), end - 1)].ms);
    const phrase = heardPhrase(spoken, k, all, i);
    if (phrase) return match(i + phrase.w.length, k, k + phrase.h.length);
    if (same(spoken[k].w, all[i])) return match(i + 1, k, k + 1);
    if (i + 1 < all.length && spoken[k].w === all[i] + all[i + 1]) return match(i + 2, k, k + 1);
    if (k + 1 < spoken.length && spoken[k].w + spoken[k + 1].w === all[i]) return match(i + 1, k, k + 2);
    return false;
  };
  for (; i < all.length; i++) {
    for (let k = j; k < Math.min(spoken.length, j + 4); k++) if (matchAt(k)) break;
  }
  return { all, times, spoken, heardAt };
}

// Up to a few words either side of words [a, b] of `list`, the run itself in
// brackets: "…apartment on [Karutsa-patoghits dot] am…". An empty run (a > b)
// shows as "[ ]" before word a.
const CONTEXT = 3;
function inContext(list, a, b) {
  const lo = Math.max(0, a - CONTEXT);
  const hi = Math.min(list.length, b + 1 + CONTEXT);
  const run = a > b ? " " : list.slice(a, b + 1).join(" ");
  return [lo > 0 ? "…" : "", [...list.slice(lo, a), `[${run}]`, ...list.slice(b + 1, hi)].join(" "), hi < list.length ? "…" : ""].join("");
}

// The written words the transcript has no match for, in runs, each set
// against what was heard between its matched neighbours. Nothing heard there
// means the voice skipped the run ("skipped"). A short run heard as a few
// other words is most likely a name the transcript spells its own way
// ("spelling"), and `entry` ([heard, written]) is the lesson.json "heard" entry
// that matches it; anything longer may be the voice saying something else
// ("differs").
function transcriptGaps(text, words) {
  const { all, times, spoken, heardAt } = alignWords(text, words);
  const written = text.split(/\s+/).filter(Boolean);
  const wordOf = written.flatMap((w, n) => norm(w).map(() => n));
  const said = words.map((w) => (w.word || "").trim());
  const gaps = [];
  for (let i = 0; i < all.length; i++) {
    if (times[i] != null) continue;
    let end = i;
    while (end + 1 < all.length && times[end + 1] == null) end++;
    const from = i > 0 ? heardAt[i - 1][1] : 0;
    const to = end + 1 < all.length ? heardAt[end + 1][0] : spoken.length;
    const wrote = all.slice(i, end + 1);
    const heard = spoken.slice(from, to).map((s) => s.w);
    const at = from < spoken.length ? spoken[from].src : said.length;
    const kind = !heard.length ? "skipped" : heard.length <= 3 && wrote.length <= 4 ? "spelling" : "differs";
    gaps.push({
      kind,
      wrote: inContext(written, wordOf[i], wordOf[end]),
      heard: inContext(said, at, heard.length ? spoken[to - 1].src : at - 1),
      ...(kind === "spelling" && { entry: [heard.join(" "), wrote.join(" ")] }),
    });
    i = end;
  }
  return gaps;
}

// An onset for every word of `text`; a word the transcript missed is placed
// between its nearest timed neighbours (or the clip's edges).
function onsets(text, words, lineMs) {
  const { all, times } = alignWords(text, words);
  return times.map((t, i) => {
    if (t != null) return t;
    let lo = i - 1;
    while (lo >= 0 && times[lo] == null) lo--;
    let hi = i + 1;
    while (hi < all.length && times[hi] == null) hi++;
    const loMs = lo >= 0 ? times[lo] : 0;
    const hiMs = hi < all.length ? times[hi] : lineMs;
    return loMs + ((i - lo) / (hi - lo)) * (hiMs - loMs);
  });
}

// Where the words of `want` first occur, in order, inside `all`; -1 if not.
function findPhrase(all, want, from = 0) {
  for (let i = from; i + want.length <= all.length; i++) {
    if (want.every((w, k) => all[i + k] === w)) return i;
  }
  return -1;
}

// The narration clock a stage keeps: which line is playing, when it started,
// and where in it a cue phrase is spoken.
class Timing {
  constructor(opts = {}) {
    this.log = opts.log || (() => {});
  }

  beginLine(line) {
    this.line = line;
    this.lineStart = Date.now();
  }

  // ms after the line starts at which `text` is spoken. Text words are aligned
  // to the clip's transcript; a word the transcript missed is interpolated
  // between its nearest timed neighbours (or the clip's edges).
  cueMs(text) {
    const { all, times } = alignWords(this.line.text, this.line.words);
    const at = findPhrase(all, norm(text));
    if (at < 0) throw new Error(`cue "${text}" is not in line "${this.line.id}"`);
    if (times[at] == null && this.line.words?.length) this.log(`cue "${text}" interpolated (transcript missed it)`);
    return Math.round(onsets(this.line.text, this.line.words, this.line.ms)[at]);
  }

  async hold(ms) {
    await sleep(ms);
  }

  async holdUntil(msFromLineStart) {
    const rest = this.lineStart + msFromLineStart - Date.now();
    if (rest > 0) await sleep(rest);
  }

  // How long a topic card stays up: through the line's narration by default,
  // or until the cue word in `until` is spoken, so the rest of the line plays
  // over the app.
  cardMs(opts = {}) {
    if (opts.ms) return opts.ms;
    const end = opts.until ? this.lineStart + this.cueMs(opts.until) : this.lineStart + this.line.ms + 400;
    return Math.max(opts.until ? 1200 : 2800, end - Date.now());
  }

  // The next push-in's id (`<line>#<n>`), as lesson.json "zooms" names it.
  zoomId() {
    const line = this.line?.id || "lead";
    return `${line}#${this.zooms.filter((z) => z.id.startsWith(`${line}#`)).length + 1}`;
  }

  // A zoom keyframe for the compositor: the picture eases to `scale` around
  // (cx, cy) in output pixels over `ms`, finishing on the cue word when one is
  // given, and stays there until the next keyframe. Its id and the target's
  // rectangle let lesson.json "zooms" adjust it at mux time.
  async recordZoom(scale, cx, cy, opts = {}, target = {}) {
    const ms = opts.ms ?? 700;
    if (opts.cue) await this.holdUntil(this.cueMs(opts.cue) - ms);
    this.zooms = this.zooms || [];
    const rect = target.rect && Object.fromEntries(Object.entries(target.rect).map(([k, v]) => [k, Math.round(v)]));
    this.zooms.push({
      id: this.zoomId(),
      startMs: Date.now() - this.t0,
      ms,
      scale: clampScale(scale),
      cx: Math.round(cx),
      cy: Math.round(cy),
      ...(target.sel && { sel: target.sel, at: target.at || [0.5, 0.5], rect }),
    });
    this.log(`zoom ${scale === 1 ? "out" : `${scale}x at ${Math.round(cx)},${Math.round(cy)}`} over ${ms}ms`);
  }
}

module.exports = { sleep, norm, alignWords, transcriptGaps, onsets, findPhrase, setHeard, Timing };
