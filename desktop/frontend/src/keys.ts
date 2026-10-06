import { isMac } from "./platform";

export interface Chord {
  key: string;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface PhysicalChord {
  key: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

const LETTER = /^[a-z]$/i;

// Chords are authored the macOS way, with ⌘. Elsewhere ⌘ becomes Ctrl, and a
// letter chord also takes Shift so plain Ctrl+letter stays with the terminal
// (Ctrl+C, D, W, R…). A letter chord that already used Shift or Alt moves up to
// the Ctrl+Alt tier, the way kitty and WezTerm layer their bindings.
export function toPhysical(chord: Chord, mac: boolean = isMac): PhysicalChord {
  const key = chord.key;
  const meta = !!chord.meta;
  const shift = !!chord.shift;
  const alt = !!chord.alt;
  if (mac || !meta) return { key, ctrl: false, meta: mac && meta, shift, alt };
  if (!LETTER.test(key)) return { key, ctrl: true, meta: false, shift, alt };
  if (alt) return { key, ctrl: true, meta: false, shift, alt: true };
  if (shift) return { key, ctrl: true, meta: false, shift: true, alt: true };
  return { key, ctrl: true, meta: false, shift: true, alt: false };
}

export function matchesChord(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
  chord: Chord,
  mac: boolean = isMac,
): boolean {
  const p = toPhysical(chord, mac);
  return (
    event.key.toLowerCase() === p.key.toLowerCase() &&
    event.ctrlKey === p.ctrl &&
    event.metaKey === p.meta &&
    event.shiftKey === p.shift &&
    event.altKey === p.alt
  );
}

const MAC_KEY_GLYPHS: Record<string, string> = {
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

const PC_KEY_NAMES: Record<string, string> = {
  enter: "Enter",
  escape: "Esc",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  pageup: "PageUp",
  pagedown: "PageDown",
  home: "Home",
  end: "End",
  insert: "Insert",
  " ": "Space",
  space: "Space",
};

export function keyName(key: string, mac: boolean = isMac): string {
  if (key.length === 1) return key.toUpperCase();
  const names = mac ? MAC_KEY_GLYPHS : PC_KEY_NAMES;
  return names[key.toLowerCase()] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

// "⌘⇧B" on macOS, "Ctrl+Alt+Shift+B" elsewhere.
export function chordLabel(chord: Chord, mac: boolean = isMac): string {
  const p = toPhysical(chord, mac);
  if (mac) {
    return (
      (p.meta ? "⌘" : "") +
      (p.alt ? "⌥" : "") +
      (p.shift ? "⇧" : "") +
      keyName(p.key, true)
    );
  }
  const parts: string[] = [];
  if (p.ctrl) parts.push("Ctrl");
  if (p.alt) parts.push("Alt");
  if (p.shift) parts.push("Shift");
  parts.push(keyName(p.key, false));
  return parts.join("+");
}

export const modKeyLabel = (mac: boolean = isMac) => (mac ? "⌘" : "Ctrl");
export const altKeyLabel = (mac: boolean = isMac) => (mac ? "⌥" : "Alt");
export const shiftKeyLabel = (mac: boolean = isMac) => (mac ? "⇧" : "Shift");
