const test = require("node:test");
const assert = require("node:assert");
const { landMoves, editMoves, LATE_MS, QUICK_MS } = require("../moves");

const lines = [
  { id: "hook", startMs: 100, ms: 2000, spokenMs: 1800 },
  { id: "a", startMs: 5000, ms: 2000, spokenMs: 1500 },
  { id: "b", startMs: 7140, ms: 2000, spokenMs: 1700 },
];

test("a move on time is left where it was recorded", () => {
  const z = { id: "b#1", startMs: 7600, ms: 500, scale: 1.8, cueMs: 8100, notBefore: 0 };
  assert.deepStrictEqual(landMoves([z], lines), [{ ...z, lateMs: 0 }]);
});

test("a move cued on a line's first word starts in the pause before it and lands on the word", () => {
  const [z] = landMoves([{ id: "b#1", startMs: 7150, ms: 450, scale: 1.5, cueMs: 7200, notBefore: 0 }], lines);
  assert.strictEqual(z.startMs, 6750);
  assert.strictEqual(z.startMs + z.ms, 7200);
  assert.strictEqual(z.lateMs, 0);
});

test("it never leaves before the last word of the line before, and plays quicker instead", () => {
  const [z] = landMoves([{ id: "b#1", startMs: 7150, ms: 900, scale: 1.5, cueMs: 7200, notBefore: 0 }], lines);
  assert.strictEqual(z.startMs, 6500, "the line before ends speaking at 6500");
  assert.strictEqual(z.ms, 700);
  assert.strictEqual(z.lateMs, 0);
});

test("it waits for the click it follows and for the move before it", () => {
  const [z] = landMoves([{ id: "b#1", startMs: 8600, ms: 500, scale: 1.5, cueMs: 8200, notBefore: 8100 }], lines);
  assert.strictEqual(z.startMs, 8100);
  assert.strictEqual(z.ms, QUICK_MS);
  assert.ok(z.lateMs > 0 && z.lateMs < LATE_MS);
  const two = landMoves(
    [
      { id: "b#1", startMs: 7300, ms: 600, scale: 1.5 },
      { id: "b#2", startMs: 8400, ms: 500, scale: 2, cueMs: 8000, notBefore: 0 },
    ],
    lines,
  );
  assert.strictEqual(two[1].startMs, 7900, "the move before it is over at 7900");
});

test("the first line seen has nothing before it to wait for", () => {
  const [z] = landMoves([{ id: "a#1", startMs: 5010, ms: 450, scale: 1.5, cueMs: 5030, notBefore: 0 }], lines, { open: 1 });
  assert.strictEqual(z.startMs, 4580);
  assert.strictEqual(z.lateMs, 0);
});

test("a move that can't make its word says how late it is", () => {
  const [z] = landMoves([{ id: "b#1", startMs: 9000, ms: 500, scale: 1.5, cueMs: 8000, notBefore: 8900 }], lines);
  assert.strictEqual(z.lateMs, 8900 + QUICK_MS - 8000);
});

test("lesson.json zooms change one move by its id and leave the rest", () => {
  const moves = [
    { id: "a#1", startMs: 1000, ms: 500, scale: 1.5, x: 50, y: 50, at: [0.5, 0.5], rect: { x: 0, y: 0, w: 100, h: 100 } },
    { id: "a#2", startMs: 3000, ms: 500, scale: 1, x: null, y: null },
    { id: "b#1", startMs: 5000, ms: 500, scale: 1.8, x: 10, y: 10 },
  ];
  const said = [];
  const out = editMoves(moves, { "a#1": { scale: 2, at: [0.2, 0.8], ms: 300, by: -100 }, "a#2": { drop: true }, "b#1": { at: [0, 0] }, "c#1": { drop: true } }, (m) => said.push(m));
  assert.deepStrictEqual(out[0], { ...moves[0], scale: 2, at: [0.2, 0.8], x: 20, y: 80, startMs: 1100, ms: 300 });
  assert.deepStrictEqual(out[1], moves[2]);
  assert.strictEqual(out.length, 2);
  assert.ok(said.some((m) => /no "c#1" in this take/.test(m)));
  assert.ok(said.some((m) => /"b#1" has no recorded target/.test(m)));
  assert.deepStrictEqual(editMoves(moves), moves);
});
