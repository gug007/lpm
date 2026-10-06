import type { KeyboardShortcut } from "./hooks/useKeyboardShortcut";
import { chordLabel, toPhysical, type PhysicalChord } from "./keys";
import { isMac } from "./platform";

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

// Human-facing rendering: macOS glyphs ("⌘⇧B"), or the physical chord in words
// elsewhere ("Ctrl+Alt+Shift+B").
export function formatShortcut(s: KeyboardShortcut, mac: boolean = isMac): string {
  if (!mac) return chordLabel(s, false);
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
// per group so the pairing is easy to find). Entries are authored the macOS way;
// off macOS each one stands for its keys.ts toPhysical form.
const RESERVED_SHARED = [
  // App.tsx — sidebar + new terminal (Cmd+1..9 added below)
  "cmd+b",
  "cmd+t",
  // TerminalView.tsx — tabs, panes, search, composer, utility tabs, zoom
  "cmd+w",
  "cmd+d",
  "cmd+shift+d",
  "cmd+f",
  "cmd+i",
  "cmd+shift+r",
  "cmd+shift+m",
  "cmd+shift+k",
  "cmd+shift+e",
  "cmd+p",
  "cmd+=",
  "cmd++",
  "cmd+-",
  "cmd+0",
  // useFilesChords.ts — path chords and the Markdown preview flip in the
  // Files tab (its file-stepping chords differ per platform, see below)
  "cmd+shift+v",
  "cmd+alt+r",
  "cmd+alt+c",
  "cmd+alt+shift+c",
  // useDetailView.ts (Cmd+E / Cmd+Shift+N) + useYamlEditor (Cmd+S)
  "cmd+e",
  "cmd+shift+n",
  "cmd+s",
  // useTTSHotkeys.ts — read selection / stop / pause reading
  "cmd+shift+l",
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
  // Modal submit (CommitModal / PRModal / FeedbackModal)
  "cmd+enter",
  // TerminalComposer.tsx — send the prompt later
  "alt+enter",
  // App.tsx — Cmd+1..9 select project by index
  ...Array.from({ length: 9 }, (_, i) => `cmd+${i + 1}`),
];

// useFilesChords.ts — stepping files in the Files and review tabs: ⌃⌥↑ / ⌃⌥↓ on
// macOS (Ctrl parses as cmd), Ctrl+Alt+PageUp / PageDown elsewhere, where
// Ctrl+Alt+arrows switch workspaces.
const RESERVED_MAC = new Set([...RESERVED_SHARED, "cmd+alt+arrowup", "cmd+alt+arrowdown"]);
const RESERVED_PC = new Set([...RESERVED_SHARED, "cmd+alt+pageup", "cmd+alt+pagedown"]);

export function reservedShortcuts(mac: boolean = isMac): ReadonlySet<string> {
  return mac ? RESERVED_MAC : RESERVED_PC;
}

// Chords Linux desktops and Windows take before any app sees them: workspace and
// window switching, session keys, the VT switch, the run dialog.
const SYSTEM_CHORDS = new Set<string>([
  "ctrl+alt+delete",
  "ctrl+alt+backspace",
  "ctrl+alt+tab",
  "ctrl+alt+escape",
  "ctrl+alt+t",
  "ctrl+alt+l",
  "ctrl+alt+d",
  "ctrl+shift+escape",
  "ctrl+escape",
  "alt+tab",
  "alt+shift+tab",
  "alt+escape",
  "alt+space",
  ...["arrowleft", "arrowright", "arrowup", "arrowdown"].flatMap((k) => [
    `ctrl+alt+${k}`,
    `ctrl+alt+shift+${k}`,
  ]),
  ...Array.from({ length: 12 }, (_, i) => [`ctrl+alt+f${i + 1}`, `alt+f${i + 1}`]).flat(),
]);

export function physicalChordId(p: PhysicalChord): string {
  const mods = [p.ctrl && "ctrl", p.meta && "meta", p.alt && "alt", p.shift && "shift"];
  const key = p.key === " " ? "space" : p.key.toLowerCase();
  return [...mods.filter(Boolean), key].join("+");
}

export function isSystemShortcut(s: KeyboardShortcut, mac: boolean = isMac): boolean {
  return !mac && SYSTEM_CHORDS.has(physicalChordId(toPhysical(s, false)));
}

// What two shortcuts collide on: the stored combo on macOS, the physical chord
// elsewhere, where ⌘⇧X and ⌘⌥⇧X are both Ctrl+Alt+Shift+X.
export function shortcutIdentity(s: KeyboardShortcut, mac: boolean = isMac): string {
  return mac ? canonicalShortcut(s) : physicalChordId(toPhysical(s, false));
}

const CANONICAL_MODS = { cmd: "meta", alt: "alt", shift: "shift" } as const;
const CANONICAL_MOD = /^(cmd|alt|shift)\+(.+)$/;

// Inverse of canonicalShortcut. The key is whatever follows the modifiers, so
// the "+" of "cmd++" survives, which parseShortcut's split would drop.
function fromCanonical(id: string): KeyboardShortcut {
  const s: KeyboardShortcut = { key: id, meta: false, shift: false, alt: false };
  for (let m = CANONICAL_MOD.exec(s.key); m; m = CANONICAL_MOD.exec(s.key)) {
    s[CANONICAL_MODS[m[1] as keyof typeof CANONICAL_MODS]] = true;
    s.key = m[2];
  }
  return s;
}

const physicalIdOf = (id: string) => shortcutIdentity(fromCanonical(id), false);
const RESERVED_PC_PHYSICAL = new Set([...RESERVED_PC].map(physicalIdOf));

// Configurable hotkey combos aren't in the reserved sets;
// callers that must block them (the action wizard) pass them via `extra`.
export function isReservedShortcut(
  s: KeyboardShortcut,
  extra?: ReadonlySet<string>,
  mac: boolean = isMac,
): boolean {
  if (!mac) {
    const id = shortcutIdentity(s, false);
    return RESERVED_PC_PHYSICAL.has(id) || [...(extra ?? [])].some((e) => physicalIdOf(e) === id);
  }
  const id = canonicalShortcut(s);
  return reservedShortcuts(mac).has(id) || (extra?.has(id) ?? false);
}

// Why a shortcut can't be bound, in the user's own key names; null when free.
export function reservedShortcutMessage(
  s: KeyboardShortcut,
  extra?: ReadonlySet<string>,
  mac: boolean = isMac,
): string | null {
  if (isSystemShortcut(s, mac)) return `${formatShortcut(s, mac)} is reserved by the system`;
  if (isReservedShortcut(s, extra, mac)) return `${formatShortcut(s, mac)} is reserved by lpm`;
  return null;
}
