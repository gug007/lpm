const test = require("node:test");
const assert = require("node:assert");
const { editList, played, takeFrame } = require("../edit");
const { slowStretches, MAX_RATE } = require("../pace");
const { keyCaps, keyBadges, isShortcut } = require("../keycaps");
const { plan } = require("../render");
const { momentsOf } = require("../sheet");
const { lines: voiced, timeline: recorded } = require("./fixture");

const lines = [
  { id: "hook", startMs: 120, ms: 2000, spokenMs: 1700 },
  { id: "a", startMs: 6000, ms: 2000, spokenMs: 1600 },
  { id: "b", startMs: 14000, ms: 2000, spokenMs: 1800 },
];

test("a long silence between two lines plays faster, and only there", () => {
  const [w, ...more] = slowStretches({ lines, open: 1 });
  assert.strictEqual(more.length, 0);
  assert.strictEqual(w.after, "a");
  assert.strictEqual(w.fromMs, 7850);
  assert.strictEqual(w.toMs, 13900);
  assert.strictEqual(w.rate, MAX_RATE);
});

test("a silence a jump cut already took, a short one and a pause on purpose stay as they are", () => {
  assert.deepStrictEqual(slowStretches({ lines, cuts: [{ fromMs: 8200, toMs: 13800 }] }), []);
  assert.deepStrictEqual(slowStretches({ lines: [lines[0], lines[1], { ...lines[2], startMs: 9200 }] }), []);
  assert.deepStrictEqual(slowStretches({ lines: [lines[0], { ...lines[1], silent: true }, lines[2]] }), []);
});

test("sped-up shots keep the clock: every moment lands inside the video, in order", () => {
  const waits = slowStretches({ lines, open: 1 });
  const e = editList({ lines, totalMs: 17000, waits, payoffMs: 14500 });
  const plain = editList({ lines, totalMs: 17000, payoffMs: 14500 });
  assert.strictEqual(e.outFrames, e.hook + e.main.reduce((n, s) => n + played(s), 0));
  assert.ok(plain.outMs - e.outMs > 4000, "6 s at 4x");
  let last = -1;
  for (let ms = 0; ms <= 17000; ms += 50) {
    const at = e.toOutMs(ms);
    assert.ok(at >= last && at <= e.outMs, `${ms} -> ${at}`);
    last = at;
  }
  const toB = e.toOutMs(14000) - e.toOutMs(6000 + 1600);
  assert.ok(toB > 1500 && toB < 2100, `silence is now ${toB}`);
  assert.strictEqual(Math.round(plain.toOutMs(15000) - plain.toOutMs(14000)), 1000);
  assert.strictEqual(Math.round(e.toOutMs(15000) - e.toOutMs(14000)), 1000, "speech is never sped up");
});

test("every frame of the video is traced back to the take's", () => {
  const e = editList({ lines, totalMs: 17000, waits: slowStretches({ lines, open: 1 }), payoffMs: 14500 });
  assert.strictEqual(takeFrame(e, 0), e.payoff[0]);
  let f = e.hook;
  for (const shot of e.main) {
    assert.strictEqual(takeFrame(e, f), shot[0]);
    f += played(shot);
  }
  assert.strictEqual(takeFrame(e, e.outFrames), null);
});

test("a moment in a jump cut or the hidden opening is not seen", () => {
  const e = editList({ lines, totalMs: 17000, cuts: [{ fromMs: 9000, toMs: 12000 }], payoffMs: 14500 });
  assert.strictEqual(e.seen(3000), false);
  assert.strictEqual(e.seen(10000), false);
  assert.strictEqual(e.seen(7000), true);
});

test("keys show as caps, and only a shortcut by itself", () => {
  assert.deepStrictEqual(keyCaps("cmd+shift+t"), ["⌘", "⇧", "T"]);
  assert.deepStrictEqual(keyCaps("Enter"), ["return"]);
  assert.deepStrictEqual(keyCaps("cmd++"), ["⌘", "+"]);
  assert.ok(isShortcut("cmd+k"));
  assert.ok(!isShortcut("return"));
  const badges = keyBadges([
    { startMs: 0, caps: ["⌘", "K"] },
    { startMs: 500, caps: ["⌘", "K"] },
    { startMs: 1000, caps: ["⌘", "T"] },
  ], { outMs: 2000 });
  assert.deepStrictEqual(badges, [
    { caps: ["⌘", "K"], startMs: 0, endMs: 1000 },
    { caps: ["⌘", "T"], startMs: 1000, endMs: 2000 },
  ]);
});

test("the plan puts the camera on its word, shows the keys that are seen and names every moment", () => {
  const lesson = { title: "t", open: 1, narration: [] };
  const timeline = recorded({
    zooms: [{ id: "a#1", startMs: 4010, ms: 450, scale: 1.8, x: 400, y: 300, cueMs: 4100, notBefore: 0, sel: "x", at: [0.5, 0.5], rect: { x: 10, y: 280, w: 800, h: 40 } }],
    presses: [{ startMs: 1000, caps: ["⌘", "V"] }, { startMs: 4600, caps: ["⌘", "K"] }],
  });
  const p = plan({ lesson, timeline, lines: voiced });
  assert.strictEqual(p.moves[0].lateMs, 0);
  assert.strictEqual(p.track.keys.length, 1, "the paste in the hidden opening shows nothing");
  assert.deepStrictEqual(p.track.keys[0].caps, ["⌘", "K"]);
  assert.strictEqual(plan({ lesson: { ...lesson, keys: false }, timeline, lines: voiced }).track.keys.length, 0);
  const what = momentsOf(p).map((m) => m.what).join(" | ");
  for (const w of ["opening", "line hook", "line a", "in a#1", "line b", "end"]) assert.ok(what.includes(w), `${w} in ${what}`);
  const ms = momentsOf(p).map((m) => m.ms);
  assert.ok(ms.every((t, i) => !i || t > ms[i - 1]) && ms.every((t) => t < p.edit.outMs));
});
