const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function spell(n) {
  if (n < 20) return [ONES[n]];
  if (n < 100) return n % 10 ? [TENS[Math.floor(n / 10)], ONES[n % 10]] : [TENS[n / 10]];
  if (n < 1000) return [ONES[Math.floor(n / 100)], "hundred", ...(n % 100 ? spell(n % 100) : [])];
  return [...spell(Math.floor(n / 1000)), "thousand", ...(n % 1000 ? spell(n % 1000) : [])];
}

// Words as the transcript and the script both reduce to them: lowercase, no
// punctuation, and numbers spelled out, so "96%" in one and "ninety-six
// percent" in the other are the same three words.
const norm = (t) =>
  t
    .toLowerCase()
    .replace(/%/g, " percent")
    .replace(/(\d)\.(\d)/g, "$1 $2")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (/^\d{1,6}$/.test(w) ? spell(Number(w)) : [w]));

// How the transcript tends to spell names the voice says right.
const HEARD_AS = { cloud: "claude", clod: "claude", clawd: "claude", clods: "claudes", clawed: "claude", codecs: "codex", codec: "codex" };
const SOUND_ALIKE = [["to", "too", "two"], ["for", "four"]];
const same = (heard, word) =>
  heard === word ||
  HEARD_AS[heard] === word ||
  SOUND_ALIKE.some((set) => set.includes(heard) && set.includes(word)) ||
  (heard.endsWith("s") && word.endsWith("s") && heard.length > 3 && HEARD_AS[heard.slice(0, -1)] === word.slice(0, -1));

// Start time (ms) of each word of `text` in the clip, or null where the
// transcript has no match for it.
function alignWords(text, words) {
  const all = norm(text);
  const spoken = [];
  for (const w of words || []) for (const n of norm(w.word)) spoken.push({ n, ms: w.start * 1000 });
  const times = new Array(all.length).fill(null);
  let j = 0;
  for (let i = 0; i < all.length; i++) {
    for (let k = j; k < Math.min(spoken.length, j + 4); k++) {
      if (same(spoken[k].n, all[i])) {
        times[i] = spoken[k].ms;
        j = k + 1;
        break;
      }
      if (i + 1 < all.length && spoken[k].n === all[i] + all[i + 1]) {
        times[i] = spoken[k].ms;
        times[i + 1] = spoken[k].ms;
        i += 1;
        j = k + 1;
        break;
      }
      if (k + 1 < spoken.length && spoken[k].n + spoken[k + 1].n === all[i]) {
        times[i] = spoken[k].ms;
        j = k + 2;
        break;
      }
    }
  }
  return { all, times };
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
    if (times[at] == null) this.log(`cue "${text}" interpolated (transcript missed it)`);
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

  // A zoom keyframe for the compositor: the picture eases to `scale` around
  // (cx, cy) in output pixels over `ms`, finishing on the cue word when one is
  // given, and stays there until the next keyframe. Its id (`<line>#<n>`) and
  // the target's rectangle let lesson.json "zooms" adjust it at mux time.
  async recordZoom(scale, cx, cy, opts = {}, target = {}) {
    const ms = opts.ms ?? 700;
    if (opts.cue) await this.holdUntil(this.cueMs(opts.cue) - ms);
    this.zooms = this.zooms || [];
    const lineId = this.line?.id || "lead";
    const n = this.zooms.filter((z) => z.id?.startsWith(`${lineId}#`)).length + 1;
    const rect = target.rect && Object.fromEntries(Object.entries(target.rect).map(([k, v]) => [k, Math.round(v)]));
    this.zooms.push({
      id: `${lineId}#${n}`,
      startMs: Date.now() - this.t0,
      ms,
      scale: Math.min(3, Math.max(1, scale)),
      cx: Math.round(cx),
      cy: Math.round(cy),
      ...(target.sel && { sel: target.sel, at: target.at || [0.5, 0.5], rect }),
    });
    this.log(`zoom ${scale === 1 ? "out" : `${scale}x at ${Math.round(cx)},${Math.round(cy)}`} over ${ms}ms`);
  }
}

module.exports = { sleep, norm, alignWords, onsets, findPhrase, Timing };
