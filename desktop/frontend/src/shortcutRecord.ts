import type { KeyboardShortcut } from "./hooks/useKeyboardShortcut";
import { keyName } from "./keys";
import { chordLetter, isAltGraphChar, type KeyEventLike } from "./keyEvents";
import { isLinux, isMac, isWindows } from "./platform";
import { canonicalShortcut, reservedShortcutMessage } from "./shortcutParse";

export type CaptureResult =
  | { kind: "ignore" }
  | { kind: "hint"; text: string }
  | { kind: "capture"; canonical: string };

const MODIFIER_KEYS = ["Meta", "Shift", "Alt", "Control"];

// Ctrl plus these is a terminal control key (Esc, SIGQUIT, NUL…), not a chord.
const TERMINAL_CTRL_KEYS = new Set(["[", "]", "\\", "/", " "]);

export function shortcutRequirementHint(mac: boolean = isMac): string {
  return mac ? "Requires ⌘ or ⌥." : "Requires Ctrl, plus Shift or Alt for letters.";
}

function pressedLabel(e: KeyEventLike, key: string = e.key): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(keyName(key, false));
  return parts.join("+");
}

function finish(shortcut: KeyboardShortcut, reserved: ReadonlySet<string> | undefined, mac: boolean): CaptureResult {
  const blocked = reservedShortcutMessage(shortcut, reserved, mac);
  if (blocked) return { kind: "hint", text: blocked };
  return { kind: "capture", canonical: canonicalShortcut(shortcut) };
}

// The macOS ⌘ chord a physical Linux/Windows press stands for (the inverse of
// keys.ts toPhysical), or why the press can't be a shortcut.
function pcShortcut(e: KeyEventLike): KeyboardShortcut | string {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (!e.ctrlKey) {
    if (e.altKey && e.key.length > 1) return { key, meta: false, shift: e.shiftKey, alt: true };
    if (e.altKey) return `${pressedLabel(e)} is kept for the terminal. Add Ctrl`;
    return "Add Ctrl to make a shortcut";
  }
  if (isAltGraphChar(e)) return "Add Ctrl to make a shortcut";
  const letter = chordLetter(e);
  if (!letter) {
    if (!e.shiftKey && !e.altKey && TERMINAL_CTRL_KEYS.has(key)) {
      return `${pressedLabel(e)} is kept for the terminal`;
    }
    return { key, meta: true, shift: e.shiftKey, alt: e.altKey };
  }
  if (e.altKey) return { key: letter, meta: true, shift: e.shiftKey, alt: !e.shiftKey };
  if (e.shiftKey) return { key: letter, meta: true, shift: false, alt: false };
  return `${pressedLabel(e, letter)} is kept for the terminal. Add Shift`;
}

// GTK and IBus input methods start Unicode entry on Ctrl+Shift+U whenever a
// text field or the terminal has focus, so that press never reaches lpm there.
function claimedByInputMethod(e: KeyEventLike): boolean {
  return e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && chordLetter(e) === "u";
}

export function captureShortcut(
  e: KeyEventLike,
  reserved?: ReadonlySet<string>,
  mac: boolean = isMac,
  linux: boolean = isLinux,
): CaptureResult {
  if (MODIFIER_KEYS.includes(e.key)) return { kind: "ignore" };
  if (mac) {
    const shortcut: KeyboardShortcut = {
      key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
      meta: e.metaKey || e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
    };
    if (!shortcut.meta && !shortcut.alt) return { kind: "hint", text: "Add ⌘ or ⌥ to make a shortcut" };
    return finish(shortcut, reserved, true);
  }
  if (e.metaKey) {
    return { kind: "hint", text: `${isWindows ? "Windows key" : "Super"} shortcuts belong to the system` };
  }
  if (linux && claimedByInputMethod(e)) {
    return { kind: "hint", text: `${pressedLabel(e, "u")} is reserved by the system` };
  }
  const shortcut = pcShortcut(e);
  if (typeof shortcut === "string") return { kind: "hint", text: shortcut };
  return finish(shortcut, reserved, false);
}
