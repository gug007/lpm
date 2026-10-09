// A phone mask's edges, fitted to the recording: the beat starts and ends a
// mask when the accessibility tree says so, which runs a few frames behind
// what is on screen. A mask with `fit` keeps the frames where its spot on the
// screen looks as it does mid-way (a sheet's address bar at rest), and the
// still stretch just before (the page still loading under it), so it neither
// shows before the sheet has risen nor stays behind as it slides away.
const { execFileSync } = require("child_process");

const FPS = 30;
const REACH_S = 3;
const SAME = 6;
const LEAD = 5;
const LEAD_FRAMES = 6;
const SETTLE_FRAMES = 12;

function fitMask(raw, region, device, mask) {
  const k = region.w / device.w;
  const [x, y, w, h] = mask.rect.map((v) => Math.round(v * k));
  const from = Math.max(0, mask.fromMs / 1000 - REACH_S);
  const len = mask.toMs / 1000 + REACH_S - from;
  const cw = Math.max(2, Math.round(w / 2) * 2);
  const ch = Math.max(2, Math.round(h / 2) * 2);
  const gray = execFileSync("ffmpeg", ["-v", "error", "-ss", from.toFixed(3), "-t", len.toFixed(3), "-i", raw,
    "-vf", `fps=${FPS},crop=${cw}:${ch}:${region.x + x}:${region.y + y},format=gray`, "-f", "rawvideo", "pipe:1"], { maxBuffer: 1 << 28 });
  const size = cw * ch;
  const frames = Math.floor(gray.length / size);
  const at = (i) => gray.subarray(i * size, (i + 1) * size);
  const mid = Math.min(frames - 1, Math.round(((mask.fromMs + mask.toMs) / 2000 - from) * FPS));
  const ref = at(mid);
  const same = (i, to, max = SAME) => {
    const f = at(i);
    let d = 0;
    for (let j = 0; j < size; j++) d += Math.abs(f[j] - to[j]);
    return d / size < max;
  };
  let a = mid;
  while (a > 0 && same(a - 1, ref)) a--;
  // The still stretch before, past the few frames where it settled (a label
  // easing into place): each frame close to the one after it.
  for (let j = a - 1; j >= Math.max(1, a - SETTLE_FRAMES); j--) {
    let lead = j;
    while (lead > 0 && same(lead - 1, at(lead), LEAD)) lead--;
    if (j - lead >= LEAD_FRAMES) {
      a = lead;
      break;
    }
  }
  let b = mid;
  while (b + 1 < frames && same(b + 1, ref)) b++;
  return { ...mask, fromMs: Math.round((from + a / FPS) * 1000), toMs: Math.round((from + (b + 1) / FPS) * 1000) };
}

function fitMasks(raw, timeline, masks, device, log = () => {}) {
  return masks.map((m) => {
    if (!m.fit) return m;
    const fitted = fitMask(raw, timeline.phone.region, device, m);
    log(`phone mask ${m.rect.join(",")}: ${m.fromMs}-${m.toMs} ms fitted to ${fitted.fromMs}-${fitted.toMs} ms`);
    return fitted;
  });
}

module.exports = { fitMasks };
