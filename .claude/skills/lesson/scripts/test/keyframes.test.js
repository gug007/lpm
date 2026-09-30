const test = require("node:test");
const assert = require("node:assert");
const { track, valueAt, toFrames } = require("../keyframes");
const { zoomStage, editZooms } = require("../compose");

// Evaluates one of the ffmpeg expressions `track` writes, at frame n.
function evalExpr(expr, n) {
  const js = expr.replace(/\bif\(/g, "IF(").replace(/\blt\(/g, "LT(").replace(/\bcos\(/g, "Math.cos(").replace(/\bPI\b/g, "Math.PI").replace(/\bin\b/g, "n");
  return new Function("n", "IF", "LT", `return ${js};`)(n, (c, a, b) => (c ? a : b), (a, b) => (a < b ? 1 : 0));
}

// Lesson 14: a 1.9x hold, then a zoom-out and a new zoom-in starting on the
// same frame (98072 and 98075 ms). The old compositor snapped to 1.0 there.
const LESSON_14 = [
  { startMs: 96000, ms: 800, scale: 1.9, cx: 440, cy: 1093 },
  { startMs: 98072, ms: 700, scale: 1, cx: 1280, cy: 720 },
  { startMs: 98075, ms: 800, scale: 1.5, cx: 912, cy: 744 },
];

test("a zoom that interrupts another eases on from where the picture is", () => {
  const keys = toFrames(LESSON_14, 30);
  const expr = track(keys, 1, (k) => k.scale);
  let prev = evalExpr(expr, 2930);
  for (let f = 2931; f < 2990; f++) {
    const v = evalExpr(expr, f);
    assert.ok(Math.abs(v - prev) < 0.05, `frame ${f}: ${prev.toFixed(3)} -> ${v.toFixed(3)}`);
    assert.ok(Math.abs(v - valueAt(keys, 1, (k) => k.scale, f)) < 1e-3);
    prev = v;
  }
  assert.ok(Math.abs(evalExpr(expr, 3000) - 1.5) < 1e-6);
});

test("the zoom stage builds one zoompan over all three channels", () => {
  const z = zoomStage(LESSON_14, { width: 2560, height: 1440 });
  assert.match(z, /^zoompan=z='.+':x='clip\(.+\)':y='clip\(.+\)':d=1:s=2560x1440:fps=30$/);
});

test("lesson.json zooms edit a take's zooms by id", () => {
  const zooms = [
    { id: "a#1", startMs: 1000, ms: 700, scale: 1.8, cx: 100, cy: 100, rect: { x: 0, y: 0, w: 200, h: 100 } },
    { id: "a#2", startMs: 3000, ms: 700, scale: 1, cx: 1280, cy: 720 },
    { id: "b#1", startMs: 5000, ms: 700, scale: 2, cx: 10, cy: 10 },
  ];
  const out = editZooms(zooms, { "a#1": { scale: 1.5, at: [0.25, 0.5], ms: 900 }, "b#1": { drop: true } });
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual({ ...out[0], rect: undefined }, { id: "a#1", startMs: 800, ms: 900, scale: 1.5, cx: 50, cy: 50, rect: undefined });
  assert.throws(() => editZooms(zooms, { "c#1": { scale: 2 } }), /no zoom "c#1"/);
  assert.throws(() => editZooms(zooms, { "b#1": { at: [0, 0] } }), /without its target/);
});
