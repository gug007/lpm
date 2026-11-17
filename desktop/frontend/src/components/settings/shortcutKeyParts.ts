export type ShortcutPart = { kind: "keys"; keys: string[] } | { kind: "sep"; text: string };

const MAC_MODIFIERS = new Set(["⌘", "⌥", "⇧", "⌃"]);

// "Ctrl+Shift+B" and "Ctrl++" off macOS; "⌘⇧B" and "⌘+" on it.
export function chordKeys(chord: string): string[] {
  if (/^[A-Za-z]/.test(chord) && /\+./.test(chord)) return chord.split(/\+(?=.)/);
  const chars = [...chord];
  const keys: string[] = [];
  let i = 0;
  while (i < chars.length - 1 && MAC_MODIFIERS.has(chars[i])) keys.push(chars[i++]);
  const rest = chars.slice(i).join("");
  if (rest) keys.push(rest);
  return keys;
}

// "⌘1 – ⌘9" as ⌘ and one 1–9 key, when both ends share their modifiers.
function rangeKeys(from: string[], to: string[]): string[] | null {
  if (from.length !== to.length || from.length === 0) return null;
  const mods = from.slice(0, -1);
  if (mods.some((key, i) => key !== to[i])) return null;
  return [...mods, `${from[from.length - 1]}–${to[to.length - 1]}`];
}

// A shortcut label as keys and what sits between them: "⌘1 – ⌘9" is a range,
// two chords set two spaces apart are alternatives.
export function shortcutKeyParts(label: string): ShortcutPart[] {
  const parts: ShortcutPart[] = [];
  const ranges = label.trim().split(/\s+–\s+/);
  if (ranges.length === 2 && !/\s{2,}/.test(label.trim())) {
    const keys = rangeKeys(chordKeys(ranges[0]), chordKeys(ranges[1]));
    if (keys) return [{ kind: "keys", keys }];
  }
  ranges.forEach((range, r) => {
    if (r > 0) parts.push({ kind: "sep", text: "–" });
    range.split(/\s{2,}/).forEach((chord, c) => {
      if (c > 0) parts.push({ kind: "sep", text: "/" });
      parts.push({ kind: "keys", keys: chordKeys(chord.trim()) });
    });
  });
  return parts;
}
