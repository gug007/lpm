const test = require("node:test");
const assert = require("node:assert");
const { planEdit, layout, mapTime, editTimeline } = require("../edit");
const { OPEN_LIFT } = require("../appstage");

// The opening card's cut runs on past the card for the window's glide home.
const HANDOVER = OPEN_LIFT.riseMs - OPEN_LIFT.leadMs + 50;
const { checkLesson } = require("../lint");

const FRAME = 1000 / 30;
const near = (a, b) => assert.ok(Math.abs(a - b) <= FRAME, `${a} is not within a frame of ${b}`);

const narration = [
  { id: "title", text: "A lesson." },
  { id: "open", text: "Open it." },
  { id: "works", text: "It works." },
  { id: "review", text: "Review it." },
  { id: "outro", ms: 3200 },
];
const take = {
  totalMs: 40600,
  lines: [
    { id: "title", startMs: 500, ms: 8000 },
    { id: "open", startMs: 9000, ms: 4000 },
    { id: "works", startMs: 13500, ms: 5000 },
    { id: "review", startMs: 30500, ms: 6000 },
    { id: "outro", startMs: 36950, ms: 3200 },
  ],
  cards: [
    { title: "A lesson", startMs: 1628, ms: 1250, first: true },
    { title: "lpm.cx", startMs: 36950, ms: 3600, hold: true },
  ],
};
// Every cut rendered at exactly its planned length.
const rendered = (plan) => layout(plan.cuts.map((c) => ({ ...c, outMs: (c.toMs - c.fromMs) / c.speed })));

test("a take with no long waits and no cold open needs no edit", () => {
  const short = { ...take, lines: take.lines.map((l) => (l.id === "review" ? { ...l, startMs: 19000 } : l.id === "outro" ? { ...l, startMs: 25450 } : l)) };
  assert.strictEqual(planEdit({ timeline: short, lesson: { narration } }), null);
});

test("a long wait between lines plays at 4x, and later lines move up by what it saved", () => {
  const plan = planEdit({ timeline: take, lesson: { narration } });
  const wait = plan.cuts.find((c) => c.kind === "wait");
  assert.strictEqual(wait.speed, 4);
  assert.strictEqual(wait.after, "works");
  near(wait.fromMs, 18500 + 400);
  near(wait.toMs, 30500 - 300);
  assert.deepStrictEqual(plan.dropped, []);
  const placed = rendered(plan);
  const saved = (wait.toMs - wait.fromMs) * (3 / 4);
  near(mapTime(placed, 30500), 30500 - saved);
  near(mapTime(placed, 9000), 9000);
});

test("waitMaxSeconds caps how long a half-hour wait plays; without it the speed stops at 16x", () => {
  const halfHour = 30 * 60 * 1000;
  const long = {
    ...take,
    totalMs: take.totalMs + halfHour,
    lines: take.lines.map((l) => (["review", "outro"].includes(l.id) ? { ...l, startMs: l.startMs + halfHour } : l)),
    cards: take.cards.map((c) => (c.hold ? { ...c, startMs: c.startMs + halfHour } : c)),
  };
  const capped = planEdit({ timeline: long, lesson: { narration, waitMaxSeconds: 20 } }).cuts.find((c) => c.kind === "wait");
  assert.ok((capped.toMs - capped.fromMs) / capped.speed <= 20000);
  assert.ok(capped.speed > 16);
  assert.strictEqual(planEdit({ timeline: long, lesson: { narration } }).cuts.find((c) => c.kind === "wait").speed, 16);
  assert.strictEqual(planEdit({ timeline: take, lesson: { narration, waitMaxSeconds: 20 } }).cuts.find((c) => c.kind === "wait").speed, 4);
});

test("speedUpWaits: false keeps waits real time", () => {
  assert.strictEqual(planEdit({ timeline: take, lesson: { narration, speedUpWaits: false } }), null);
});

test("a wait a card fills is left alone", () => {
  const carded = { ...take, cards: [...take.cards, { title: "Topic", startMs: 22000, ms: 2000 }] };
  assert.strictEqual(planEdit({ timeline: carded, lesson: { narration, speedUpWaits: true } })?.cuts.some((c) => c.kind === "wait") ?? false, false);
});

test("a cold open plays its shots, the opening card, then the lesson from its second line", () => {
  const lesson = { narration, speedUpWaits: false, coldOpen: { text: "Hook.", shots: [{ line: "review", from: 1, to: 3 }, { line: "works", from: 0, to: 1 }] } };
  const plan = planEdit({ timeline: take, lesson, hookMs: 2000 });
  const [a, b, card, main] = plan.cuts;
  assert.deepStrictEqual([a.kind, b.kind, card.kind, main.kind], ["shot", "shot", "card", "main"]);
  near(a.fromMs, 31500);
  near(a.toMs, 33500);
  near(card.fromMs, 1628 + 150);
  near(card.toMs, 1628 + 1250 + HANDOVER);
  near(main.fromMs, 9000 - 300);
  assert.deepStrictEqual(plan.dropped, ["title"]);
});

test("a hook longer than its shots stretches the last shot", () => {
  const lesson = { narration, speedUpWaits: false, coldOpen: { text: "A long hook.", shots: [{ line: "review", from: 1, to: 2 }] } };
  const plan = planEdit({ timeline: take, lesson, hookMs: 4000 });
  near(plan.cuts[0].toMs - plan.cuts[0].fromMs, 300 + 4000 + 450);
});

test("the edited timeline starts on the hook and keeps what survived at its new time", () => {
  const lesson = { narration, coldOpen: { text: "Hook.", shots: [{ line: "review", from: 1, to: 5 }] } };
  const plan = planEdit({ timeline: take, lesson, hookMs: 3000 });
  const placed = rendered(plan);
  const edited = editTimeline(take, plan, placed, { ms: 3000 });
  assert.deepStrictEqual(edited.lines.map((l) => l.id), ["coldOpen", "open", "works", "review", "outro"]);
  assert.strictEqual(edited.lines[0].startMs, 300);
  const open = edited.lines.find((l) => l.id === "open");
  near(open.startMs, 4000 + (1250 + HANDOVER - 150) + 300);
  assert.strictEqual(edited.cards[0].title, "A lesson", "the opening card survives the frame snap");
  near(edited.cards[0].startMs, 4000);
  near(edited.totalMs, placed.reduce((s, c) => s + c.outMs, 0));
  assert.ok(edited.edit.some((c) => c.kind === "wait"));
});

const beats = {
  setup() {},
  async title(s) {
    await s.card("A lesson");
  },
  async open() {},
  async works() {},
  async review() {},
  async outro(s) {
    await s.card("lpm.cx", { hold: true });
  },
};

test("the lint checks a cold open and a cover", () => {
  const good = { title: "A lesson", narration, coldOpen: { text: "Here is the payoff.", shots: [{ line: "review", from: 1, to: 4 }] }, cover: { words: "Check it", line: "review", at: 1, style: "window" } };
  assert.deepStrictEqual(checkLesson(good, beats).errors, []);
  const bad = {
    title: "A lesson",
    narration,
    coldOpen: { text: "Hook.", shots: [{ line: "nope", from: 2, to: 1 }] },
    cover: { line: "nope", style: "poster", crop: [1, 2] },
    speedUpWaits: "yes",
  };
  const errors = checkLesson(bad, beats).errors.join("\n");
  for (const want of ['coldOpen shot on "nope"', '"from" and "to"', "no \"words\"", 'names "nope"', 'style "poster"', '"crop"', '"speedUpWaits"']) {
    assert.ok(errors.includes(want), `missing: ${want}\n${errors}`);
  }
});
