// The keys a beat pressed, as keycaps over the video for a moment, so a
// shortcut reads with the sound off.

const SHOW_MS = 1300;
const MODIFIERS = ["⌘", "⇧", "⌥", "⌃"];
const SYMBOLS = {
  cmd: "⌘", command: "⌘", meta: "⌘",
  shift: "⇧",
  alt: "⌥", option: "⌥",
  ctrl: "⌃", control: "⌃",
  enter: "return", return: "return",
  esc: "esc", escape: "esc",
  tab: "tab",
  space: "space", " ": "space",
  backspace: "⌫", delete: "⌫",
  up: "↑", arrowup: "↑",
  down: "↓", arrowdown: "↓",
  left: "←", arrowleft: "←",
  right: "→", arrowright: "→",
};

const partsOf = (combo) => {
  const text = String(combo);
  const parts = text === "+" ? ["+"] : text.endsWith("++") ? [...text.slice(0, -2).split("+"), "+"] : text.split("+");
  return parts.filter((p) => p !== "");
};

// The keycaps for a combo as s.keys() and s.press() take it ("cmd+shift+k").
const keyCaps = (combo) => partsOf(combo).map((p) => SYMBOLS[p.toLowerCase()] || (p.length === 1 ? p.toUpperCase() : p));

// A shortcut is worth showing by itself; a lone Return or Escape is how a beat
// gets things done.
const isShortcut = (combo) => keyCaps(combo).some((cap) => MODIFIERS.includes(cap));

// Presses ({ startMs, caps }, on the finished clock, in order) as badges: the
// same keys pressed again keep theirs up, other keys replace it.
function keyBadges(presses, { outMs }) {
  const out = [];
  for (const p of presses) {
    const last = out.at(-1);
    if (last && p.startMs < last.endMs) {
      if (last.caps.join(" ") === p.caps.join(" ")) {
        last.endMs = p.startMs + SHOW_MS;
        continue;
      }
      last.endMs = p.startMs;
    }
    out.push({ caps: p.caps, startMs: p.startMs, endMs: p.startMs + SHOW_MS });
  }
  return out.map((b) => ({ ...b, endMs: Math.min(b.endMs, outMs) })).filter((b) => b.endMs > b.startMs);
}

module.exports = { keyCaps, keyBadges, isShortcut };
