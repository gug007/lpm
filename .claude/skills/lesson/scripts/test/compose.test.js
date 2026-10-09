const test = require("node:test");
const assert = require("node:assert");
const { coverSpans, videoGraph } = require("../compose");
const { OPEN_LIFT } = require("../appstage");

const cards = [
  { title: "Review code changes", startMs: 1628, ms: 1254, first: true },
  { title: "Undo and commit", startMs: 40000, ms: 2000 },
  { title: "lpm.cx", startMs: 100000, ms: 3600, hold: true },
];

test("the window leaves its place for as long as each card is up", () => {
  const [open, topic, end] = coverSpans(cards, 104000);
  assert.strictEqual(open.a, 0);
  assert.ok(Math.abs(open.b - (1.628 + 1.254 - OPEN_LIFT.leadMs / 1000 + OPEN_LIFT.riseMs / 1000)) < 1e-9);
  assert.ok(Math.abs(open.fadeIn - 1.778) < 1e-9, "the window fades in as the opening words rise");
  assert.deepStrictEqual([topic.a, topic.b], [40, 42]);
  assert.strictEqual(end.a, 100);
  assert.ok(end.b > 104, "a held card keeps the window beside it to the end");
});

test("the composed picture hides the placed window while a card has it", () => {
  const g = videoGraph({
    out: { width: 2560, height: 1440 },
    canvas: "c.png",
    shadow: "s.png",
    mask: "m.png",
    box: { x: 180, y: 100, w: 2200, h: 1240 },
    cards,
    cardFiles: ["a.mkv", "b.mkv", "c.mkv"],
    totalMs: 104000,
  });
  assert.match(g.filter, /enable='not\(gte\(t,0\.000\)\*lt\(t,[\d.]+\)\+gte\(t,40\.000\)\*lt\(t,42\.000\)\+gte\(t,100\.000\)\*lt\(t,105\.000\)\)'/);
  for (const i of [0, 1, 2]) assert.match(g.filter, new RegExp(`\\[v${i + 1}\\]\\[cv${i}\\]overlay`), `card ${i} gets the window above it`);
  assert.match(g.filter, /scale=w='2560\*\(1-0\.22\*\(/);
});

test("a card later in the take reads the window from its own inputs, seeked to the card", () => {
  const g = videoGraph({
    out: { width: 2560, height: 1440 },
    canvas: "c.png",
    shadow: "s.png",
    mask: "m.png",
    box: { x: 180, y: 100, w: 2200, h: 1240 },
    cards,
    cardFiles: ["a.mkv", "b.mkv", "c.mkv"],
    totalMs: 104000,
    take: "take.mkv",
  });
  assert.match(g.filter, /alphamerge,split=2\[w1c\]\[w\]/, "only the opener shares the take's window");
  assert.deepStrictEqual(g.inputs.slice(g.inputs.indexOf("c.mkv") + 1, g.inputs.indexOf("c.mkv") + 6), ["-ss", "40.000", "-t", "2.000", "-i"]);
  assert.match(g.filter, /\[7:v\]scale=2200:1240:[^;]*\[w2t\]/);
  assert.match(g.filter, /\[w2t\]\[m2t\]alphamerge,setpts=PTS-STARTPTS\+40\.000\/TB\[w2c\]/);
  assert.match(g.filter, /\[w3t\]\[m3t\]alphamerge,setpts=PTS-STARTPTS\+100\.000\/TB\[w3c\]/);
  assert.strictEqual(g.count, 3 + 3 + 6);
});

test("a push-in on the window stops short of the phone when its target still fits", () => {
  const { phoneLayout, clearOfPhone } = require("../phonecompose");
  const out = { width: 2560, height: 1440 };
  const layout = phoneLayout(out, 2);
  const row = { x: 864, y: 429, w: 856, h: 109 };
  const [mac, phone, both, out1] = clearOfPhone(
    [
      { id: "a", scale: 1.5, cx: 1292, cy: 484, rect: row },
      { id: "b", scale: 1.6, cx: 2210, cy: 498, rect: { x: 2021, y: 452, w: 379, h: 94 } },
      { id: "c", scale: 1.4, cx: 1657, cy: 558, rect: { x: 864, y: 429, w: 1587, h: 258 } },
      { id: "d", scale: 1, cx: 1280, cy: 720 },
    ],
    layout,
    out,
  );
  assert.ok(mac.cx + 1280 / 1.5 <= layout.outer.x);
  assert.ok(mac.cx - 1280 / 1.5 <= row.x);
  assert.strictEqual(phone.cx, 2210);
  assert.strictEqual(both.cx, 1657);
  assert.strictEqual(out1.cx, 1280);
});
