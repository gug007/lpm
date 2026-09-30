// Everything written on screen, on the finished video's clock: the sticker at
// the top (the hook headline, then numbered step labels, then the lpm.cx end
// sticker) and word-by-word captions — each line's words as written, grouped
// into short pages, timed by the clip's transcript so the spoken word lights up.
const shared = require("./shared");
const { norm, onsets } = shared("words");
const { SLAM } = require("./look");

const PAGE_WORDS = 3;
const PAGE_CHARS = 16;
const PAGE_BREAK_MS = 650;
const TAIL_MS = 200;
const MIN_HOOK_MS = 600;

// Words as shown: `*word*` is highlighted, a trailing full stop or comma is
// dropped (captions read cleaner without them), ? and ! stay.
function tokens(line) {
  const text = line.text.replace(/\*/g, "");
  const at = onsets(text, line.words, line.ms);
  const out = [];
  let k = 0;
  for (const raw of line.text.split(/\s+/).filter(Boolean)) {
    const plain = raw.replace(/\*/g, "");
    const parts = norm(plain).length;
    const shown = plain.replace(/[.,;:]+$/, "");
    if (!parts) {
      if (out.length && shown) out.at(-1).text += ` ${shown}`;
      continue;
    }
    out.push({ text: shown, emph: raw.includes("*"), ms: Math.round(at[k]), brk: /[.,!?:;]$/.test(plain) });
    k += parts;
  }
  return out;
}

function pages(line, outStartMs) {
  const toks = tokens(line);
  if (!toks.length) return [];
  const lastWord = (line.words || []).at(-1);
  const endMs = Math.min(line.ms, lastWord ? lastWord.end * 1000 + TAIL_MS : line.ms);
  const groups = [];
  let cur = [];
  for (const t of toks) {
    const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + t.text.length;
    const pause = cur.length && t.ms - cur.at(-1).ms > PAGE_BREAK_MS;
    if (cur.length && (cur.length >= PAGE_WORDS || chars > PAGE_CHARS || pause)) {
      groups.push(cur);
      cur = [];
    }
    cur.push(t);
    if (t.brk) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) groups.push(cur);
  return groups.map((g, i) => ({
    startMs: outStartMs + g[0].ms,
    endMs: outStartMs + (i + 1 < groups.length ? groups[i + 1][0].ms : endMs),
    words: g.map((t) => ({ text: t.text, emph: t.emph, ms: outStartMs + t.ms })),
  }));
}

// `lines` are the timeline's lines with their clip (`line`) and `outMs`, the
// line's start in the finished video; `labels` come from the stage, already
// on the finished clock. `slam` ({ a, b }) opens with the two names slammed in
// big, and the headline pops in as they shrink away.
function textTrack({ lines, labels = [], outMs, headline, cta, open = 1, slam }) {
  const spokenLines = lines.filter((l) => !l.line.silent);
  const captionPages = spokenLines.flatMap((l) => pages(l.line, l.outMs));
  const hookEnd = lines.length > open ? lines[open].outMs : outMs;
  const marks = [
    ...lines.filter((l) => l.line.label !== undefined).map((l) => ({ startMs: l.outMs, text: l.line.label })),
    ...labels,
  ]
    .filter((m) => m.startMs >= hookEnd)
    .sort((a, b) => a.startMs - b.startMs);
  const stickers = [];
  const hookStart = slam ? SLAM.handoffMs : 0;
  // After a slam, a headline with under MIN_HOOK_MS left would only flash.
  if (headline && (!slam || hookEnd - hookStart >= MIN_HOOK_MS)) stickers.push({ kind: "hook", text: headline, startMs: hookStart });
  let n = 0;
  for (const m of marks) {
    const prev = stickers.at(-1);
    if (m.text && m.plain) stickers.push({ kind: "label", text: m.text, n: null, pop: !prev?.plain, plain: true, startMs: m.startMs });
    else if (m.text) stickers.push({ kind: "label", text: m.text, n: ++n, startMs: m.startMs });
    else stickers.push({ kind: "none", startMs: m.startMs });
  }
  if (cta) stickers.push({ kind: "cta", text: cta, startMs: lines.at(-1).outMs });
  stickers.forEach((s, i) => {
    s.endMs = i + 1 < stickers.length ? stickers[i + 1].startMs : outMs;
    if (s.kind === "hook") s.endMs = Math.min(s.endMs, hookEnd);
  });
  return {
    stickers: stickers.filter((s) => s.kind !== "none" && s.endMs > s.startMs),
    pages: captionPages,
    ...(slam && { slam: { a: slam.a, b: slam.b, colors: slam.colors || SLAM.colors, startMs: 0, endMs: Math.min(SLAM.ms, hookEnd) } }),
  };
}

module.exports = { textTrack, pages, tokens };
