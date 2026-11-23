const test = require("node:test");
const assert = require("node:assert");
const { TikTokStage } = require("../tiktokstage");
const { heard } = require("./fixture");

// A stage over an app that answers every lookup with one element.
function stage(t, { line, rect = { x: 100, y: 200, w: 80, h: 40 } } = {}) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 10000 });
  const control = {
    evaluate: async (fn) => {
      const src = String(fn);
      if (src.includes("__lc.rect")) return rect;
      if (src.includes("__lc.find")) return true;
      return undefined;
    },
    call: async () => ({}),
  };
  const s = new TikTokStage({ control }, {}, { mouse: "dom", lesson: { narration: [{ id: "hook" }, { id: "a" }], open: 1 }, origin: { x: 0, y: 0, w: 820, h: 1040, scale: 2 }, out: { width: 1080, height: 1920 }, box: {} });
  s.t0 = 5000;
  s.beginLine(line);
  return s;
}
const run = async (t, p) => {
  let done = false;
  const ended = p.finally(() => (done = true));
  while (!done) {
    await new Promise((r) => setImmediate(r));
    t.mock.timers.tick(20);
  }
  return ended;
};
const line = (text, id = "a") => ({ id, text, ms: 3000, words: heard(text) });

test("a camera move records its word, its target and what it came after", async (t) => {
  const s = stage(t, { line: line("Now open the menu here") });
  await run(t, s.click(".b", { ms: 200 }));
  const clicked = s.actedMs;
  await run(t, s.focus(".menu", { scale: 1.8, at: [0.25, 0.5], cue: "menu", ms: 400 }));
  await run(t, s.wide({ ms: 300 }));
  const [z, w] = s.zooms;
  assert.strictEqual(z.id, "a#1");
  assert.strictEqual(z.cueMs, 5000 + 900);
  assert.strictEqual(z.notBefore, clicked);
  assert.deepStrictEqual([z.x, z.y, z.rect, z.at], [120, 220, { x: 100, y: 200, w: 80, h: 40 }, [0.25, 0.5]]);
  assert.deepStrictEqual([w.id, w.x, w.scale, w.cueMs], ["a#2", null, 1, undefined]);
});

test("a late pointer warns, except in the opening nobody sees", async (t) => {
  const s = stage(t, { line: line("Hover the tab") });
  await run(t, s.moveTo(".tab", { ms: 600, cue: "Hover" }));
  assert.strictEqual(s.warnings.length, 1);
  assert.match(s.warnings[0].message, /"Hover" lands 0\.6 s late/);
  s.beginLine(line("Hover the tab", "hook"));
  await run(t, s.moveTo(".tab", { ms: 600, cue: "Hover" }));
  assert.strictEqual(s.warnings.length, 1);
});

test("a shortcut is noted for its badge, a lone key only when asked", async (t) => {
  const s = stage(t, { line: line("Press it now") });
  for (const [combo, opts] of [["cmd+shift+t"], ["return"], ["escape", { badge: true }], ["cmd+v", { badge: false }]]) await s.notePress(combo, opts);
  assert.deepStrictEqual(s.presses.map((p) => p.caps.join("")), ["⌘⇧T", "esc"]);
});
