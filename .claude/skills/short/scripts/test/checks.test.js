const test = require("node:test");
const assert = require("node:assert");
const { plan } = require("../render");
const { checksFor } = require("../checks");
const { heard, lines, timeline } = require("./fixture");

const found = (t, ls = lines, lesson = {}) => checksFor(lesson, plan({ lesson: { open: 1, ...lesson }, timeline: t, lines: ls }));
const of = (list, check) => list.filter((c) => c.check === check && c.level !== "OK").map((c) => c.message);

test("a tidy cut has nothing to report", () => {
  assert.deepStrictEqual(found(timeline()).filter((c) => c.level !== "OK"), []);
});

test("a long hook, a long silence and a payoff that runs out are reported", () => {
  const slow = timeline({ lines: [{ id: "hook", startMs: 120, ms: 3200 }, { id: "a", startMs: 4000, ms: 2000 }, { id: "b", startMs: 7400, ms: 2000 }], payoffMs: 9000 });
  const list = found(slow, [{ ...lines[0], ms: 3200 }, ...lines.slice(1)], { speedUpWaits: false });
  assert.match(of(list, "hook")[0], /the hook runs 3\.2 s/);
  assert.match(of(list, "dead air")[0], /with nothing said after "a"/);
  assert.match(of(list, "cut")[0], /payoff shot runs past the end/);
});

test("a camera move left late is reported, one in the hidden opening is not", () => {
  const late = { ms: 500, scale: 1.5, x: 400, y: 300 };
  const list = found(timeline({ zooms: [{ ...late, id: "hook#1", startMs: 1500, cueMs: 400, notBefore: 1400 }, { ...late, id: "a#1", startMs: 5600, cueMs: 4400, notBefore: 5500 }] }));
  const said = of(list, "cue");
  assert.strictEqual(said.length, 1);
  assert.match(said[0], /a#1 lands 1\.4 s after its word/);
});

test("a push-in that crops the whole of its target says which scale shows it", () => {
  const wide = { id: "a#1", startMs: 4200, ms: 400, scale: 2.2, x: 410, y: 300, at: [0.5, 0.5], rect: { x: 110, y: 280, w: 600, h: 40 } };
  const [note] = of(found(timeline({ zooms: [wide] })), "framing");
  assert.match(note, /a#1 shows \d+% of its target's width at 2\.2x; 1\.[2-5]x shows all of it/);
  const left = { ...wide, at: [0.1, 0.5], x: 170 };
  assert.deepStrictEqual(of(found(timeline({ zooms: [left] })), "framing"), [], "aimed at one end on purpose");
  assert.deepStrictEqual(of(found(timeline({ zooms: [{ ...wide, rect: { x: 390, y: 280, w: 40, h: 40 } }] })), "framing"), []);
});

test("a word the voice skipped is reported, a respelling only noted", () => {
  const skipped = { ...lines[1], words: heard("Press shortcut now.") };
  assert.match(of(found(timeline(), [lines[0], skipped, lines[2]]), "voice")[0], /skipped words/);
  const spelled = { ...lines[1], words: heard("Press the shorecut now.") };
  const [c] = found(timeline(), [lines[0], spelled, lines[2]]).filter((x) => x.check === "voice");
  assert.strictEqual(c.level, "NOTE");
  assert.match(c.message, /"heard": \{ "shorecut": "shortcut" \}/);
});
