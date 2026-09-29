const test = require("node:test");
const assert = require("node:assert");
const { norm, alignWords, onsets, findPhrase, Timing } = require("../words");

const heard = (text, step = 300) => text.split(" ").map((word, i) => ({ word, start: (i * step) / 1000, end: (i * step + 250) / 1000 }));

test("numbers and percent read the same written or heard", () => {
  assert.deepStrictEqual(norm("96%"), ["ninety", "six", "percent"]);
  assert.deepStrictEqual(norm("ninety-six percent"), ["ninety", "six", "percent"]);
  assert.deepStrictEqual(norm("Step 2, then 1.5x"), ["step", "two", "then", "one", "5x"]);
  assert.deepStrictEqual(norm("2026"), ["two", "thousand", "twenty", "six"]);
});

test("the transcript's digits and misheard names still align", () => {
  const { times } = alignWords("It's at ninety-six percent of the weekly limit", heard("It's at 96% of the weekly limit"));
  assert.ok(times.every((t) => t != null), `unaligned: ${times}`);
  const names = alignWords("Open Codex, then Claude's menu", heard("Open codec, then Clods menu"));
  assert.ok(names.times.every((t) => t != null));
  const sounds = alignWords("Two or three, too", heard("to or three two"));
  assert.ok(sounds.times.every((t) => t != null));
});

test("a word the transcript missed gets an onset between its neighbours", () => {
  const at = onsets("click the blue button", [{ word: "click", start: 0, end: 0.2 }, { word: "button", start: 0.9, end: 1.1 }], 1500);
  assert.strictEqual(at[0], 0);
  assert.ok(at[1] > 0 && at[1] < at[2] && at[2] < 900);
  assert.strictEqual(at[3], 900);
});

test("phrases are found in order, and again after a first match", () => {
  const all = norm("Remove it, then press Remove it again");
  const first = findPhrase(all, norm("Remove it"));
  assert.strictEqual(first, 0);
  assert.strictEqual(findPhrase(all, norm("Remove it"), first + 1), 4);
  assert.strictEqual(findPhrase(all, norm("not here")), -1);
});

test("cueMs lands on the spoken word and refuses a cue the line lacks", () => {
  const t = new Timing();
  t.beginLine({ id: "a", text: "Now click Send it", words: heard("Now click Send it"), ms: 2000 });
  assert.strictEqual(t.cueMs("Send"), 600);
  assert.throws(() => t.cueMs("Stop"), /not in line "a"/);
});
