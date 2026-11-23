const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { makeVoice, mapLimit, post, speaker } = require("../voice");
const { alignWords, setHeard } = require("../words");
const heard = require("./heard");

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test("mapLimit keeps the order, runs no more than its limit and stops at a failure", async () => {
  let running = 0;
  let most = 0;
  const out = await mapLimit([30, 5, 20, 1, 10], 3, async (ms, i) => {
    most = Math.max(most, ++running);
    await tick(ms);
    running--;
    return i;
  });
  assert.deepStrictEqual(out, [0, 1, 2, 3, 4]);
  assert.strictEqual(most, 3);
  const started = [];
  await assert.rejects(mapLimit(["slow", "boom", "c"], 2, async (x) => {
    started.push(x);
    await tick(x === "slow" ? 30 : 5);
    if (x === "boom") throw new Error("boom");
  }), /boom/);
  assert.deepStrictEqual(started, ["slow", "boom"]);
});

test("the brand is spoken as letters, a highlight is never read, pronounce swaps a word", () => {
  assert.strictEqual(speaker()("In lpm, pick *Clean*."), "In LPM, pick Clean.");
  assert.strictEqual(speaker({ nginx: "engine x" })("nginx in lpm"), "engine x in LPM");
});

test("lesson.json heard adds to the usual misheard names", (t) => {
  t.after(() => setHeard());
  const missed = (text, said) => alignWords(text, heard(said)).times.filter((x) => x == null).length;
  assert.strictEqual(missed("Claude or Muse Wonder", "Clod or Muse Wander"), 1);
  setHeard({ wander: "wonder" });
  assert.strictEqual(missed("Claude or Muse Wonder", "Clod or Muse Wander"), 0);
});

// A voice over a fake API whose clips run as long as `seconds` says, in turn.
function fakeVoice(t, seconds) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lesson-voice-"));
  const real = global.fetch;
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test";
  t.after(() => {
    global.fetch = real;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  t.mock.method(console, "log", () => {});
  const calls = [];
  const clip = (s) => execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `anullsrc=r=24000:cl=mono:d=${s}`, "-f", "wav", "-"], { maxBuffer: 1 << 26 });
  global.fetch = async (url, init) => {
    if (!url.includes("/speech")) return Response.json({ words: heard("Claude almost out") });
    calls.push(JSON.parse(init.body).input);
    return new Response(clip(seconds[Math.min(calls.length, seconds.length) - 1]));
  };
  return { dir, calls, make: (opts) => makeVoice({ audioDir: dir, voice: "marin", style: "s", ...opts }) };
}
const line = { id: "hook", text: "Claude almost out?" };

test("a hook over its cap is spoken again and the shortest clip is kept", async (t) => {
  const v = fakeVoice(t, [3, 2.8, 3.4]);
  const [hook] = await v.make().prepare([{ ...line, capMs: 2500 }]);
  assert.strictEqual(v.calls.length, 3);
  assert.strictEqual(hook.ms, 2800);
  const again = await v.make().prepare([{ ...line, capMs: 2500 }]);
  assert.strictEqual(v.calls.length, 3, "a clip on disk is never replaced for its length");
  assert.strictEqual(again[0].ms, 2800);
});

test("a hook under its cap is spoken once", async (t) => {
  const v = fakeVoice(t, [2]);
  await v.make().prepare([{ ...line, capMs: 2500 }]);
  assert.strictEqual(v.calls.length, 1);
});

test("a dry run uses the clip a line has and never speaks", async (t) => {
  const v = fakeVoice(t, [2]);
  const [estimated] = await v.make().prepare([line], { dry: true });
  assert.strictEqual(v.calls.length, 0);
  assert.strictEqual(estimated.wav, undefined);
  await v.make().prepare([line]);
  const [real] = await v.make().prepare([line], { dry: true });
  assert.strictEqual(real.ms, 2000);
  assert.ok(real.wav);
  const [changed] = await v.make().prepare([{ ...line, text: "Claude almost out now?" }], { dry: true });
  assert.strictEqual(changed.wav, undefined);
  assert.strictEqual(v.calls.length, 1);
});

test("a dry run uses the clip the take would, one spoken with the previous style included", async (t) => {
  const v = fakeVoice(t, [2]);
  await v.make().prepare([line]);
  const [dry] = await v.make({ style: "other" }).prepare([line], { dry: true });
  const [recut] = await v.make({ style: "other" }).prepare([line], { cachedOnly: true });
  assert.strictEqual(dry.wav, recut.wav);
  assert.strictEqual(dry.ms, recut.ms);
  assert.strictEqual(v.calls.length, 1);
});

test("respeak speaks an unchanged line again, but never in a re-cut", async (t) => {
  const v = fakeVoice(t, [2, 1.8]);
  await v.make().prepare([line]);
  await v.make({ respeak: true }).prepare([line], { cachedOnly: true });
  assert.strictEqual(v.calls.length, 1);
  const [again] = await v.make({ respeak: true }).prepare([line]);
  assert.strictEqual(v.calls.length, 2);
  assert.strictEqual(again.ms, 1800);
});

test("post waits out a rate limit but not an empty account", async (t) => {
  t.mock.method(console, "log", () => {});
  const real = global.fetch;
  t.after(() => (global.fetch = real));
  const replies = [[429, "rate", { "retry-after": "0" }], [200, "ok"]];
  global.fetch = async () => new Response(...(([status, body, headers]) => [body, { status, headers }])(replies.shift()));
  assert.strictEqual((await post("https://x", {}, "tts", { waitMs: () => 0 })).status, 200);
  replies.push([429, "insufficient_quota"], [200, "ok"]);
  assert.strictEqual((await post("https://x", {}, "tts", { waitMs: () => 0 })).status, 429);
});
