// A take of three lines, as voiced and as recorded.
const heard = require("../../../lesson/scripts/test/heard");

const say = (id, text, extra) => ({ id, text, ms: 2000, words: heard(text.replace(/\*/g, "")), ...extra });
const lines = [say("hook", "Claude almost out?", { headline: "Switch accounts" }), say("a", "Press the *shortcut* now.", { label: "Press it" }), say("b", "Now you can keep going.")];
const timeline = (over = {}) => ({
  totalMs: 11000,
  box: { w: 1640, h: 2080, scale: 2 },
  lines: [{ id: "hook", startMs: 120, ms: 2000 }, { id: "a", startMs: 4000, ms: 2000 }, { id: "b", startMs: 6140, ms: 2000 }],
  cuts: [],
  payoffMs: 8000,
  zooms: [],
  pointer: [],
  ...over,
});

module.exports = { heard, say, lines, timeline };
