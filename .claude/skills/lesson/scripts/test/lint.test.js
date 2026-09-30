const test = require("node:test");
const assert = require("node:assert");
const { checkLesson } = require("../lint");
const { fitLines } = require("../fit");

const ok = {
  title: "A lesson",
  narration: [
    { id: "title", text: "A lesson about starting a project." },
    { id: "start", text: "Click Start, and both services come up." },
    { id: "outro", ms: 3200 },
  ],
};
const okBeats = {
  setup() {},
  async title(s) {
    await s.card("A lesson");
  },
  async start(s) {
    await s.click("button", { cue: "Start" });
    await s.zoom("nav", { cue: "both services" });
  },
  async outro(s) {
    await s.card("lpm.cx", { hold: true });
  },
};

test("a lesson that follows the rules lints clean", () => {
  assert.deepStrictEqual(checkLesson(ok, okBeats), { errors: [], warnings: [] });
});

test("mistakes that used to surface mid-take are errors", () => {
  const lesson = { ...ok, narration: [...ok.narration.slice(0, 2), { id: "setup", text: "x." }, { id: "wrap", text: "In the next video we add a service." }, ok.narration[2]] };
  const beats = {
    ...okBeats,
    async start(s) {
      await s.click("button", { cue: "Stop" });
    },
  };
  const { errors } = checkLesson(lesson, beats);
  assert.ok(errors.some((e) => /cue "Stop" is not in its line/.test(e)));
  assert.ok(errors.some((e) => /called "setup"/.test(e)));
  assert.ok(errors.some((e) => /no beat for narration line "wrap"/.test(e)));
  assert.ok(errors.some((e) => /points at another video/.test(e)));
});

test("an ambiguous or backwards cue and a short closing sentence are warnings", () => {
  const lesson = { ...ok, narration: [ok.narration[0], { id: "start", text: "Remove it from the list, then Remove it. Done." }, ok.narration[2]] };
  const beats = {
    ...okBeats,
    async start(s) {
      await s.click("a", { cue: "from the list" });
      await s.click("b", { cue: "Remove it" });
    },
  };
  const { errors, warnings } = checkLesson(lesson, beats);
  assert.deepStrictEqual(errors, []);
  assert.ok(warnings.some((w) => /occurs more than once/.test(w)));
  assert.ok(warnings.some((w) => /comes earlier in the line/.test(w)));
  assert.ok(warnings.some((w) => /very short sentence \("Done\."\)/.test(w)));
});

test("vertical lessons have no s.card and placeholders never get recorded", () => {
  const lesson = { ...ok, narration: [{ id: "a", text: "TODO: write it." }] };
  const { errors } = checkLesson(lesson, { async a(s) { await s.card("x"); } }, { kind: "vertical" });
  assert.ok(errors.some((e) => /TODO placeholder/.test(e)));
  assert.ok(errors.some((e) => /calls s\.card\(\)/.test(e)));
});

test("a re-spoken line is fine while it ends before the next one starts", () => {
  const timeline = { totalMs: 20000, lines: [{ id: "a", startMs: 500, ms: 3000 }, { id: "b", startMs: 8000, ms: 2000 }, { id: "c", startMs: 12000, ms: 2000 }] };
  const lines = [{ id: "a", ms: 5000 }, { id: "b", ms: 4200 }, { id: "c", ms: 2000 }];
  const { errors, notes } = fitLines(timeline, lines);
  assert.strictEqual(notes.length, 1);
  assert.match(notes[0], /"a" changed .* fits/);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /"b" is now 4\.20 s but the take left 4\.00 s/);
  const gone = fitLines(timeline, [{ id: "a", ms: 3000 }, { id: "c", ms: 2000 }, { id: "d", ms: 1000 }]);
  assert.ok(gone.errors.some((e) => /"b" is in the take but no longer/.test(e)));
  assert.ok(gone.errors.some((e) => /"d" is not in the take/.test(e)));
});
