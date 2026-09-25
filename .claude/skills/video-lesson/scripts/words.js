const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const norm = (t) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);

// How the transcript tends to spell names the voice says right.
const HEARD_AS = { cloud: "claude", clod: "claude", clawed: "claude", codecs: "codex" };
const same = (heard, word) => heard === word || HEARD_AS[heard] === word;

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
    const want = norm(text);
    const { all, times } = alignWords(this.line.text, this.line.words);
    let at = -1;
    for (let i = 0; i + want.length <= all.length; i++) {
      if (want.every((w, k) => all[i + k] === w)) {
        at = i;
        break;
      }
    }
    if (at < 0) throw new Error(`cue "${text}" is not in line "${this.line.id}"`);
    if (times[at] != null) return Math.round(times[at]);
    let lo = at - 1;
    while (lo >= 0 && times[lo] == null) lo--;
    let hi = at + 1;
    while (hi < all.length && times[hi] == null) hi++;
    const loMs = lo >= 0 ? times[lo] : 0;
    const loIdx = lo >= 0 ? lo : -1;
    const hiMs = hi < all.length ? times[hi] : this.line.ms;
    const hiIdx = hi < all.length ? hi : all.length;
    this.log(`cue "${text}" interpolated (transcript missed it)`);
    return Math.round(loMs + ((at - loIdx) / (hiIdx - loIdx)) * (hiMs - loMs));
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
  // given, and stays there until the next keyframe.
  async recordZoom(scale, cx, cy, opts = {}) {
    const ms = opts.ms ?? 700;
    if (opts.cue) await this.holdUntil(this.cueMs(opts.cue) - ms);
    this.zooms = this.zooms || [];
    this.zooms.push({ startMs: Date.now() - this.t0, ms, scale: Math.min(3, Math.max(1, scale)), cx: Math.round(cx), cy: Math.round(cy) });
    this.log(`zoom ${scale === 1 ? "out" : `${scale}x at ${Math.round(cx)},${Math.round(cy)}`} over ${ms}ms`);
  }
}

module.exports = { sleep, norm, alignWords, Timing };
