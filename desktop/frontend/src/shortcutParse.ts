import type { KeyboardShortcut } from "./hooks/useKeyboardShortcut";

const MOD_ALIASES: Record<string, "meta" | "shift" | "alt"> = {
  cmd: "meta",
  command: "meta",
  meta: "meta",
  ctrl: "meta",
  control: "meta",
  shift: "shift",
  alt: "alt",
  opt: "alt",
  option: "alt",
};

// Parse a stored shortcut string ("cmd+shift+b") into a KeyboardShortcut, with
// every modifier resolved to an explicit boolean so matching is exact. Returns
// null when the string is malformed, names no key (or more than one), or omits
// the required Cmd/Alt modifier — plain keys are rejected so a shortcut never
// hijacks typing in the terminal or composer.
export function parseShortcut(raw: string): KeyboardShortcut | null {
  const parts = raw
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return null;

  let meta = false;
  let shift = false;
  let alt = false;
  let key = "";
  for (const part of parts) {
    const mod = MOD_ALIASES[part];
    if (mod === "meta") meta = true;
    else if (mod === "shift") shift = true;
    else if (mod === "alt") alt = true;
    else if (key) return null;
    else key = part;
  }

  if (!key) return null;
  if (!meta && !alt) return null;
  return { key, meta, shift, alt };
}

// Stable identity for a shortcut, used as a map key, for reserved-combo
// lookups, and as the canonical string stored in YAML.
export function canonicalShortcut(s: KeyboardShortcut): string {
  const mods = [s.meta ? "cmd" : "", s.alt ? "alt" : "", s.shift ? "shift" : ""];
  return [...mods.filter(Boolean), s.key.toLowerCase()].join("+");
}

const KEY_GLYPHS: Record<string, string> = {
  enter: "↩",
  escape: "⎋",
  tab: "⇥",
  backspace: "⌫",
  delete: "⌦",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  " ": "Space",
  space: "Space",
};

function keyLabel(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  return KEY_GLYPHS[key.toLowerCase()] ?? key.toUpperCase();
}

// Human-facing rendering using macOS modifier glyphs, e.g. "⌘⇧B".
export function formatShortcut(s: KeyboardShortcut): string {
  const parts: string[] = [];
  if (s.meta) parts.push("⌘");
  if (s.alt) parts.push("⌥");
  if (s.shift) parts.push("⇧");
  parts.push(keyLabel(s.key));
  return parts.join("");
}

// Combos already claimed by lpm's built-in shortcuts and the native macOS menu.
// Binding an action to one of these would either double-fire or be swallowed by
// the OS before the webview sees it, so the wizard blocks them. This list is a
// hand-maintained mirror of the scattered shortcut sources noted below — when a
// new global shortcut is added there, add it here too (the source file is named
// per group so the pairing is easy to find).
const RESERVED = new Set<string>([
  // App.tsx — sidebar + new terminal (Cmd+1..9 added below)
  "cmd+b",
  "cmd+t",
  // TerminalView.tsx — tabs, panes, search, composer, review, zoom
  "cmd+w",
  "cmd+d",
  "cmd+shift+d",
  "cmd+f",
  "cmd+i",
  "cmd+shift+r",
  "cmd+=",
  "cmd++",
  "cmd+-",
  "cmd+0",
  // useDetailView.ts (Cmd+E / Cmd+Shift+N) + useYamlEditor (Cmd+S)
  "cmd+e",
  "cmd+shift+n",
  "cmd+s",
  // useTTSHotkeys.ts — stop / pause reading
  "cmd+shift+s",
  "cmd+shift+p",
  // menu.rs — native Settings accelerator
  "cmd+,",
  // Native macOS edit / window commands the OS or webview handles
  "cmd+c",
  "cmd+v",
  "cmd+x",
  "cmd+a",
  "cmd+z",
  "cmd+shift+z",
  "cmd+q",
  "cmd+m",
  "cmd+h",
  "cmd+n",
  "cmd+o",
  "cmd+p",
  // Modal submit (CommitModal / PRModal / FeedbackModal)
  "cmd+enter",
]);
// App.tsx — Cmd+1..9 select project by index
for (let n = 1; n <= 9; n++) RESERVED.add(`cmd+${n}`);

// The tab-switch combos are user-configurable, so they aren't in RESERVED;
// callers that must block them (the action wizard) pass them via `extra`.
export function isReservedShortcut(s: KeyboardShortcut, extra?: ReadonlySet<string>): boolean {
  const id = canonicalShortcut(s);
  return RESERVED.has(id) || (extra?.has(id) ?? false);
}
