// Mirrors the desktop app's chord rules (desktop/frontend/src/keys.ts): ⌘
// becomes Ctrl off macOS, and a letter chord adds Shift so plain Ctrl+letter
// stays with the terminal; a letter chord that already had ⇧ or ⌥ moves to
// Ctrl+Alt. Editor saves and defaults that differ by platform are listed
// outright.
const PC_DEFAULTS: Record<string, string> = {
  "⌘S": "Ctrl+S",
  "⌘⌥←": "Ctrl+PageUp",
  "⌘⌥→": "Ctrl+PageDown",
  "⌘+": "Ctrl+=",
  "⌘−": "Ctrl+-",
};

const PC_KEY_NAMES: Record<string, string> = {
  "↩": "Enter",
  "↵": "Enter",
  "⌫": "Backspace",
  "⇥": "Tab",
};

export function pcShortcut(mac: string, linux = false): string {
  const fixed = PC_DEFAULTS[mac];
  if (fixed) return fixed;

  const match = /^([⌘⌃⌥⇧]*)(.+)$/u.exec(mac);
  if (!match || !match[1]) return mac;
  const [, mods, rawKey] = match;
  const key = PC_KEY_NAMES[rawKey] ?? rawKey;
  const cmd = mods.includes("⌘");
  let alt = mods.includes("⌥");
  let shift = mods.includes("⇧");

  if (cmd && /^[A-Z]$/.test(key)) {
    if (alt || shift) alt = true;
    else if (linux && key === "U") alt = true;
    else shift = true;
  }

  const parts: string[] = [];
  if (cmd || mods.includes("⌃")) parts.push("Ctrl");
  if (alt) parts.push("Alt");
  if (shift) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}
