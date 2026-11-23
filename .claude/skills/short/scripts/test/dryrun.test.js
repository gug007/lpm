const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { recordingKey, namedKey, changes, scriptFiles } = require("../dryrun");
const { beginTake, promote, finishDryTake, keptDryTake, useDryTake } = require("../shared")("takes");

const MEDIA = ["record.mkv", "timeline.json"];

function lessonFolder(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "short-dry-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const lesson = { title: "Demo", window: { w: 820, h: 1040 }, narration: [{ id: "a", text: "Click Save.", label: "Save" }] };
  fs.writeFileSync(path.join(dir, "helper.js"), "module.exports = 1;\n");
  fs.writeFileSync(path.join(dir, "seed.json"), "{}");
  fs.writeFileSync(path.join(dir, "beats.js"), 'const h = require("./helper");\nconst SEED = "seed.json";\nmodule.exports = { async a(s) {} };\n');
  fs.mkdirSync(path.join(dir, "audio"));
  const wav = path.join(dir, "audio", "a.wav");
  fs.writeFileSync(wav, "clip one");
  return { dir, lesson, wav, lines: [{ id: "a", text: "Click Save.", ms: 1200, wav, words: [{ word: "Click", start: 0, end: 0.3 }] }] };
}

const keyOf = ({ dir, lesson, lines }, over = {}, mode = { mouse: "dom" }, app = "app-1") => recordingKey(dir, { ...lesson, ...over }, lines, mode, app);

function take(dir, { dry, key, warnings } = {}) {
  const tk = beginTake(dir, { dry });
  tk.stopLog();
  fs.writeFileSync(tk.raw, `capture of ${tk.id}`);
  fs.writeFileSync(tk.timeline, JSON.stringify({ take: tk.id, totalMs: 2000, lines: [], ...(key && { reuse: key }), ...(warnings && { warnings }) }));
  if (!dry) promote(dir, tk, MEDIA);
  else if (!key) finishDryTake(tk);
  return tk;
}

test("the key ignores what only the render reads", (t) => {
  const f = lessonFolder(t);
  const key = keyOf(f);
  const render = { title: "Other", post: { caption: "x" }, zooms: { "a#1": { drop: true } }, music: false, keys: false, open: 2, headline: "y", narration: [{ id: "a", text: "Click Save.", label: "Other" }] };
  assert.deepStrictEqual(changes(key, keyOf(f, render)), []);
});

test("the key follows the script, what beats.js reads, the clips, the app and the flags", (t) => {
  const f = lessonFolder(t);
  const key = keyOf(f);
  assert.deepStrictEqual(changes(key, keyOf(f, { window: { w: 900, h: 1040 } })), ["lesson.json"]);
  assert.deepStrictEqual(changes(key, keyOf(f, {}, { mouse: "real" })), ["the flags"]);
  assert.deepStrictEqual(changes(key, keyOf(f, {}, { mouse: "dom" }, "app-2")), ["the app"]);
  assert.deepStrictEqual(changes(key, keyOf({ ...f, lines: [{ ...f.lines[0], text: "Click Save now." }] })), ["lesson.json"]);
  fs.writeFileSync(f.wav, "clip two");
  assert.deepStrictEqual(changes(key, keyOf(f)), ["the voice clips"]);
  fs.writeFileSync(f.wav, "clip one");
  for (const [file, text, what] of [["helper.js", "module.exports = 2;\n", "beats.js"], ["seed.json", '{"a":1}', "the files beats.js names"]]) {
    const was = fs.readFileSync(path.join(f.dir, file));
    fs.writeFileSync(path.join(f.dir, file), text);
    assert.deepStrictEqual(changes(key, keyOf(f)), [what], file);
    fs.writeFileSync(path.join(f.dir, file), was);
  }
  assert.deepStrictEqual(scriptFiles(f.dir).map((x) => path.basename(x)), ["beats.js", "helper.js"]);
});

test("a file the beats write while recording does not make the dry run unusable", (t) => {
  const f = lessonFolder(t);
  const before = keyOf(f);
  fs.writeFileSync(path.join(f.dir, "seed.json"), '{"atMs":4200}');
  const key = { ...before, ...namedKey(f.dir) };
  assert.deepStrictEqual(changes(key, keyOf(f)), []);
  fs.writeFileSync(path.join(f.dir, "seed.json"), '{"atMs":1}');
  assert.deepStrictEqual(changes(key, keyOf(f)), ["the files beats.js names"]);
});

test("a clean dry run is the next take, only while it is the newest", (t) => {
  const { dir } = lessonFolder(t);
  const dry = take(dir, { dry: true, key: { a: 1 } });
  assert.strictEqual(keptDryTake(dir)?.id, dry.id);
  take(dir, {});
  assert.strictEqual(keptDryTake(dir), null, "a take came after it");
  assert.ok(!fs.existsSync(dry.raw), "and its capture is gone");
});

test("a dry run with warnings, or not kept, is never the take", (t) => {
  const { dir } = lessonFolder(t);
  take(dir, { dry: true, key: { a: 1 }, warnings: [{ kind: "cue", message: "late" }] });
  assert.strictEqual(keptDryTake(dir), null);
  const est = take(dir, { dry: true });
  assert.ok(!fs.existsSync(est.raw));
  assert.strictEqual(keptDryTake(dir), null);
});

test("the dry run used as the take is promoted like one and survives being archived", (t) => {
  const { dir } = lessonFolder(t);
  const dry = take(dir, { dry: true, key: { a: 1 } });
  useDryTake(dir, keptDryTake(dir), MEDIA).stopLog();
  assert.strictEqual(fs.readFileSync(path.join(dir, "record.mkv"), "utf8"), `capture of ${dry.id}`);
  const promoted = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
  assert.strictEqual(promoted.reuse, undefined);
  assert.strictEqual(promoted.take, dry.id);
  take(dir, {});
  assert.strictEqual(fs.readFileSync(path.join(dir, "_takes", dry.id, "record.mkv"), "utf8"), `capture of ${dry.id}`);
  take(dir, { dry: true });
  assert.ok(fs.existsSync(path.join(dir, "_takes", dry.id, "record.mkv")), "an archived take is never dropped as a kept dry run");
});
