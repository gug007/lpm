// sheet.jpg: the finished video at every moment worth a look (each line near
// its end, each camera move once it has landed, the opening and the last frame,
// with nothing left out for more than a second and a half), TikTok's interface
// drawn over each, and what and when under it.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const shared = require("./shared");
const { STILL_OUT } = shared("compose");
const { FPS } = require("./camera");
const { withPage, renderGuides } = require("./overlays");

const LANDED_MS = 150;
const SAME_MS = 250;
const FILL_MS = 1500;
const TILE = { w: 300, h: 533 };
const COLS = 7;
const PAD = 10;
const LABEL_H = 34;

// The moments, on the finished clock, in order: { ms, what }.
function momentsOf({ lines, moves, edit, open, coverMs }) {
  const { outMs } = edit;
  const list = [{ ms: coverMs, what: "opening" }];
  lines.forEach((l, i) => {
    if (l.silent) return;
    const end = (lines[i + 1]?.outMs ?? outMs) - 120;
    list.push({ ms: Math.min(l.outMs + l.ms * 0.85, end), what: `line ${l.id}` });
  });
  const hidden = lines[open]?.startMs ?? Infinity;
  for (const z of moves) if (z.id && z.startMs + z.ms >= hidden && edit.seen(z.startMs + z.ms)) list.push({ ms: edit.toOutMs(z.startMs + z.ms) + LANDED_MS, what: `${z.scale > 1 ? "in" : "wide"} ${z.id}` });
  list.push({ ms: outMs - 100, what: "end" });
  const kept = [];
  for (const m of list.filter((x) => x.ms >= 0 && x.ms < outMs).sort((a, b) => a.ms - b.ms)) {
    const last = kept.at(-1);
    if (last && m.ms - last.ms < SAME_MS) last.what += ` · ${m.what}`;
    else kept.push({ ...m });
  }
  const out = [];
  for (const m of kept) {
    const from = out.at(-1)?.ms ?? 0;
    const n = Math.floor((m.ms - from) / FILL_MS);
    for (let k = 1; k <= n; k++) out.push({ ms: from + ((m.ms - from) * k) / (n + 1), what: "" });
    out.push(m);
  }
  return out.map((m) => ({ ms: Math.round(m.ms), what: m.what }));
}

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

async function makeSheet({ mp4, moments, lookDir, file }) {
  const guides = await renderGuides(lookDir);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "short-sheet-"));
  try {
    const b64 = (f, type) => `data:image/${type};base64,${fs.readFileSync(f).toString("base64")}`;
    const frames = moments.map((m) => `eq(n\\,${Math.ceil((m.ms * FPS) / 1000)})`).join("+");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp4, "-an", "-vf", `select='${frames}',scale=${TILE.w}:${TILE.h}:${STILL_OUT}`, "-fps_mode", "passthrough", "-q:v", "4", "-start_number", "0", path.join(tmp, "%d.jpg")]);
    const tiles = moments.map((m, i) => `<figure><img src="${b64(path.join(tmp, `${i}.jpg`), "jpeg")}"><figcaption>${(m.ms / 1000).toFixed(1)}${m.what ? ` <b>${esc(m.what)}</b>` : ""}</figcaption></figure>`);
    const rows = Math.ceil(tiles.length / COLS);
    const size = { width: COLS * (TILE.w + PAD) + PAD, height: rows * (TILE.h + LABEL_H + PAD) + PAD };
    const html = `<!doctype html><meta charset="utf-8"><style>
html, body { margin: 0; background: #17171c; }
body { padding: ${PAD}px 0 0 ${PAD}px; display: flex; flex-wrap: wrap; width: ${size.width - PAD}px; }
figure { margin: 0 ${PAD}px ${PAD}px 0; width: ${TILE.w}px; position: relative; }
figure::after { content: ""; position: absolute; left: 0; top: 0; width: ${TILE.w}px; height: ${TILE.h}px; background: url(${b64(guides, "png")}) 0 0 / 100% 100%; }
img { display: block; width: ${TILE.w}px; height: ${TILE.h}px; }
figcaption { height: ${LABEL_H}px; line-height: ${LABEL_H}px; font: 600 17px/${LABEL_H}px -apple-system, sans-serif; color: #9a9aa6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
figcaption b { color: #fff; }
</style>${tiles.join("")}`;
    await withPage(size, async (page) => {
      await page.setContent(html);
      await page.screenshot({ path: file, type: "jpeg", quality: 82 });
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { makeSheet, momentsOf };
