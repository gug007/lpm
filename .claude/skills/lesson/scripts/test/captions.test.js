const test = require("node:test");
const assert = require("node:assert");
const { buildCues, toSrt, wrap } = require("../captions");
const { chapters } = require("../chapters");

const words = (text, step = 280) => text.split(" ").map((word, i) => ({ word, start: (i * step) / 1000, end: (i * step + 240) / 1000 }));

const lines = [
  { id: "title", text: "Multiple Claude Code accounts in lpm.", words: words("Multiple cloud code accounts in LPM."), ms: 2400 },
  {
    id: "limit",
    text: "Down in the sidebar, your main Claude login has already used almost all of its weekly limit, so add a second one.",
    words: words("Down in the sidebar, your main cloud login has already used almost all of its weekly limit, so add a second one."),
    ms: 6400,
  },
  { id: "outro", silent: true, ms: 3200 },
];
const timeline = {
  totalMs: 16000,
  lines: [
    { id: "title", startMs: 500, ms: 2400 },
    { id: "limit", startMs: 3400, ms: 6400 },
    { id: "outro", startMs: 12800, ms: 3200 },
  ],
};

test("captions carry the script's words, not what speech recognition heard", () => {
  const cues = buildCues(timeline, lines);
  const text = cues.map((c) => c.text).join(" ");
  assert.match(text, /Claude Code/);
  assert.match(text, /lpm\./);
  assert.doesNotMatch(text, /cloud|LPM/);
});

test("cues are ordered, never overlap, and fit two 42-character lines", () => {
  const cues = buildCues(timeline, lines);
  cues.forEach((c, i) => {
    assert.ok(c.endMs > c.startMs);
    if (i) assert.ok(c.startMs >= cues[i - 1].endMs);
    for (const l of c.text.split("\n")) assert.ok(l.length <= 42, l);
    assert.ok(c.text.split("\n").length <= 2);
  });
  assert.strictEqual(cues[0].startMs, 500);
  assert.ok(cues.at(-1).endMs <= 12800);
});

test("SRT numbering and clock format", () => {
  const srt = toSrt([{ startMs: 500, endMs: 3661001, text: "a\nb" }]);
  assert.strictEqual(srt, "1\n00:00:00,500 --> 01:01:01,001\na\nb\n");
  assert.strictEqual(wrap("short"), "short");
});

test("chapters start at 0:00, come from cards and lines, and flag YouTube's limits", () => {
  const t = {
    totalMs: 90000,
    cards: [
      { title: "Lesson", startMs: 500, ms: 3000, first: true },
      { title: "Second part", startMs: 30000, ms: 2000 },
      { title: "lpm.cx", startMs: 86000, ms: 3200, hold: true },
    ],
    lines: [
      { id: "a", startMs: 500, ms: 3000 },
      { id: "b", startMs: 30000, ms: 3000 },
      { id: "c", startMs: 60000, ms: 3000 },
      { id: "d", startMs: 84000, ms: 2000 },
      { id: "outro", startMs: 86000, ms: 3200 },
    ],
  };
  const lesson = { narration: [{ id: "a", text: "x" }, { id: "b", text: "x" }, { id: "c", text: "x", chapter: "Third part" }, { id: "d", text: "x", chapter: "Too short" }, { id: "outro" }] };
  const { list, problems } = chapters(t, lesson);
  assert.deepStrictEqual(list.map((c) => [c.ms, c.name]), [[0, "Intro"], [30000, "Second part"], [60000, "Third part"], [84000, "Too short"]]);
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0], /"Too short" lasts 2\.0 s/);
});

test("captions never break inside a name or a label, and a short tail joins the cue before", () => {
  assert.strictEqual(wrap("But on cellular, or on another Wi-Fi, lpm Link can't reach it."), "But on cellular, or on another Wi-Fi,\nlpm Link can't reach it.");
  assert.doesNotMatch(wrap("Now the iPhone. Open lpm Link and tap Set up Built-in Tailscale."), /(lpm|Set|Built-in)\n/);
  const text = "Your Mac shows up under On this Wi-Fi, so tap it.";
  const cues = buildCues({ totalMs: 6000, lines: [{ id: "pick", startMs: 0, ms: 4000 }] }, [{ id: "pick", text, words: words(text), ms: 4000 }]);
  assert.strictEqual(cues.length, 1);
});

test("a chapter starts on the second nearer its line, never on the tail of the line before", () => {
  const t = {
    totalMs: 120000,
    cards: [],
    lines: [
      { id: "a", startMs: 500, ms: 3000 },
      { id: "b", startMs: 60000, ms: 14200 },
      { id: "c", startMs: 74998, ms: 3000 },
      { id: "d", startMs: 100300, ms: 3000 },
    ],
  };
  const lesson = { narration: [{ id: "a", text: "x" }, { id: "b", text: "x", chapter: "B" }, { id: "c", text: "x", chapter: "C" }, { id: "d", text: "x", chapter: "D" }] };
  assert.deepStrictEqual(chapters(t, lesson).list.map((c) => c.ms), [0, 60000, 75000, 100000]);
});
