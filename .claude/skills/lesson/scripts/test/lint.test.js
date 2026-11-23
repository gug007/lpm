const test = require("node:test");
const assert = require("node:assert");
const { checkLesson, checkNarration, refuseMistakes } = require("../lint");
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

const vertical = {
  title: "Switch accounts mid-chat",
  open: 2,
  narration: [
    { id: "hook", text: "Claude almost out?", headline: "Switch Claude accounts mid-chat 🔀" },
    { id: "keep", text: "Your *conversation* keeps going." },
    { id: "pick", text: "Right-click the tab. Pick *Personal*.", label: "Pick an account" },
    { id: "wrap", text: "No starting over." },
  ],
  post: { caption: "Switch accounts in lpm.", hashtags: ["claude", "lpm"] },
};
const verticalBeats = { async hook() {}, async keep() {}, async pick(s) { await s.click("x", { cue: "Personal" }); }, async wrap(s) { await s.payoff(); } };
const lintVertical = (lesson, beats = {}) => checkLesson({ ...vertical, ...lesson }, { ...verticalBeats, ...beats }, { kind: "vertical" });

test("a vertical lesson that follows the rules lints clean", () => {
  assert.deepStrictEqual(lintVertical(), { errors: [], warnings: [] });
});

test("a pointer cued on a line's first word can't land on it, a camera move can", () => {
  const late = lintVertical({}, { async pick(s) { await s.click("x", { at: [0.5, 0.5], cue: "Right-click", ms: 400 }); } });
  assert.ok(late.warnings.some((w) => /s\.click on "Right-click", the line's first word, lands 0\.4 s late/.test(w)));
  const camera = lintVertical({}, { async pick(s) { await s.focus("x", { cue: "Right-click", ms: 400 }); } });
  assert.deepStrictEqual(camera.warnings, []);
  const hidden = lintVertical({}, { async hook(s) { await s.click("x", { cue: "Claude" }); } });
  assert.deepStrictEqual(hidden.warnings, [], "the opening's beats are never seen");
});

test("copy, post and payoff mistakes are found before the voice is paid for", () => {
  const { warnings, errors } = lintVertical({
    narration: [{ id: "hook", text: "In this video we look at switching accounts." }, vertical.narration[1], { id: "pick", text: "Right-click, then pick, then *wait." }, vertical.narration[3]],
    post: { caption: "By @lpm", hashtags: ["a", "b", "c", "d", "e", "f"] },
  }, { async wrap() {} });
  for (const re of [/announces the video/, /2 commas/, /no headline/, /has an @/, /6 hashtags/, /leave out "lpm"/, /no beat calls s\.payoff/]) assert.ok(warnings.some((w) => re.test(w)), String(re));
  assert.ok(errors.some((e) => /unpaired \*/.test(e)));
  assert.ok(lintVertical({ open: 4 }).errors.some((e) => /nothing is left after the opening/.test(e)));
});

test("a vertical push-in can also be shifted at mux time", () => {
  assert.deepStrictEqual(lintVertical({ zooms: { "pick#1": { by: -200, scale: 1.4 } } }).errors, []);
  assert.ok(lintVertical({ zooms: { "pick#1": { zoom: 2 } } }).errors.some((e) => /unknown zoom/.test(e)));
  assert.ok(checkLesson({ ...ok, zooms: { "start#1": { by: 100 } } }, okBeats).errors.some((e) => /unknown by/.test(e)));
});

test("the lines are checked on their own before the voice is paid for", () => {
  assert.deepStrictEqual(checkNarration(vertical, { kind: "vertical" }), { errors: [], warnings: [] });
  const todo = checkNarration({ narration: [{ id: "a", text: "TODO: the hook." }, { id: "a", text: "Click, then pick, then *wait." }] }, { kind: "vertical" });
  for (const re of [/"a" still has a TODO/, /"a" is used twice/, /unpaired \*/]) assert.ok(todo.errors.some((e) => re.test(e)), String(re));
  assert.throws(() => refuseMistakes(todo), /mistakes to fix first/);
});
