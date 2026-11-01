import { keyName, type PhysicalChord } from "./keys";
import type { KeyEventLike } from "./keyEvents";
import { isAltGraphChar } from "./keyEvents";
import { isMac, isWindows } from "./platform";
import { isSystemChord } from "./shortcutParse";
import type { CaptureResult } from "./shortcutRecord";

// The quick terminal's key, in the form the global-shortcut plugin reads:
// modifiers, then the physical key's code ("ctrl+alt+super+KeyT"). A key that
// works over other apps is matched by position, not by the character typed.
export interface QuickTerminalSetting {
  enabled: boolean;
  key: string;
}

export type QuickTerminalProblem =
  | { kind: "held" }
  | { kind: "wayland" }
  | { kind: "headless" }
  | { kind: "invalid" }
  | { kind: "failed"; detail: string };

export interface QuickTerminalStatus {
  registered: boolean;
  problem: QuickTerminalProblem | null;
}

export interface GlobalKey {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  super: boolean;
  code: string;
}

export function defaultQuickTerminalKey(mac: boolean = isMac): string {
  return mac ? "ctrl+alt+super+KeyT" : "ctrl+alt+shift+KeyT";
}

const CODE =
  /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Arrow(Up|Down|Left|Right)|Enter|Tab|Backspace|Delete|Home|End|PageUp|PageDown|Insert)$/;

export function parseGlobalKey(raw: string): GlobalKey | null {
  const parts = raw.split("+");
  const code = parts.pop() ?? "";
  if (!CODE.test(code)) return null;
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  if ([...mods].some((m) => !["ctrl", "alt", "shift", "super"].includes(m))) return null;
  return { ctrl: mods.has("ctrl"), alt: mods.has("alt"), shift: mods.has("shift"), super: mods.has("super"), code };
}

export function formatGlobalKey(k: GlobalKey): string {
  const mods = [k.ctrl && "ctrl", k.alt && "alt", k.shift && "shift", k.super && "super"];
  return [...mods.filter(Boolean), k.code].join("+");
}

const PUNCTUATION: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

function keyLabel(code: string, mac: boolean): string {
  return keyName(PUNCTUATION[code] ?? code.replace(/^Key|^Digit/, ""), mac);
}

export function globalKeyLabel(raw: string, mac: boolean = isMac, windows: boolean = isWindows): string {
  const k = parseGlobalKey(raw);
  if (!k) return raw;
  const key = keyLabel(k.code, mac);
  if (mac) {
    return `${k.ctrl ? "⌃" : ""}${k.alt ? "⌥" : ""}${k.shift ? "⇧" : ""}${k.super ? "⌘" : ""}${key}`;
  }
  const mods = [k.ctrl && "Ctrl", k.alt && "Alt", k.shift && "Shift", k.super && (windows ? "Win" : "Super")];
  return [...mods.filter(Boolean), key].join("+");
}

function strongCount(k: Pick<GlobalKey, "ctrl" | "alt" | "super">): number {
  return [k.ctrl, k.alt, k.super].filter(Boolean).length;
}

export function globalKeyRequirement(mac: boolean = isMac, windows: boolean = isWindows): string {
  if (mac) return "Hold at least two of ⌃ ⌥ ⌘ with a key.";
  return `Hold at least two of Ctrl, Alt and ${windows ? "Win" : "Super"} with a key.`;
}

function physical(k: GlobalKey): PhysicalChord {
  const key = k.code.replace(/^Key|^Digit/, "").toLowerCase();
  return { key, ctrl: k.ctrl, meta: k.super, alt: k.alt, shift: k.shift };
}

/** Reads a key press made while recording the quick terminal's key. */
export function captureGlobalKey(
  e: KeyEventLike,
  mac: boolean = isMac,
  windows: boolean = isWindows,
): CaptureResult {
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/.test(e.code)) return { kind: "ignore" };
  if (!CODE.test(e.code)) return { kind: "hint", text: "That key can't be used. Press another." };
  const k: GlobalKey = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, super: e.metaKey, code: e.code };
  if (strongCount(k) < 2) return { kind: "hint", text: globalKeyRequirement(mac, windows) };
  if (!mac && isAltGraphChar(e)) {
    return { kind: "hint", text: "That types a character on this keyboard. Press another." };
  }
  if (!mac && isSystemChord(physical(k))) {
    return { kind: "hint", text: "Your computer already uses that. Press another." };
  }
  return { kind: "capture", canonical: formatGlobalKey(k) };
}

export function quickTerminalProblemText(problem: QuickTerminalProblem, key: string): string {
  switch (problem.kind) {
    case "held":
      return `${globalKeyLabel(key)} is held by another app. Press a different key.`;
    case "wayland":
      return "Wayland doesn't let an app listen for a key while another app is in front, so the quick terminal can't be turned on here.";
    case "headless":
      return "This computer runs lpm without a screen, so there's nowhere to show the quick terminal.";
    case "invalid":
      return `lpm can't listen for ${globalKeyLabel(key)}. Press a different key.`;
    case "failed":
      return `The quick terminal couldn't be turned on: ${problem.detail}`;
  }
}

export function normalizeQuickTerminal(raw: unknown): QuickTerminalSetting | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const key = typeof o.key === "string" && parseGlobalKey(o.key) ? o.key : defaultQuickTerminalKey();
  return { enabled: o.enabled === true, key };
}
