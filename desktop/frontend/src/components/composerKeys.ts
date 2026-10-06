import { isMac } from "../platform";
import { chordLetter, isAltGraphChar, type KeyEventLike } from "../keyEvents";

export type ComposerEdit =
  | "lineStart"
  | "lineEnd"
  | "charBack"
  | "charForward"
  | "lineUp"
  | "lineDown"
  | "killLineEnd"
  | "killLineStart"
  | "killWordBack"
  | "deleteForward"
  | "deleteBack"
  | "selectAll"
  | "copy"
  | "cut"
  | "noFormat";

export type ComposerChord = ComposerEdit | "undo" | "redo" | "paste" | "newTab" | "closeTab";

// macOS gives text fields these ⌃ bindings natively; Linux and Windows don't,
// and Chromium/WebKitGTK would bold, italicize or underline on Ctrl+B/I/U.
const CTRL_EDITS: Record<string, ComposerEdit | "undo" | "redo"> = {
  a: "lineStart",
  e: "lineEnd",
  b: "charBack",
  f: "charForward",
  p: "lineUp",
  n: "lineDown",
  k: "killLineEnd",
  u: "killLineStart",
  w: "killWordBack",
  d: "deleteForward",
  h: "deleteBack",
  i: "noFormat",
  z: "undo",
  y: "redo",
};

// ⌘A/C/X/V and ⌘Z's physical forms (keys.ts toPhysical) act on the field.
// Ctrl+Shift+Z stays redo, as in every Linux and Windows text field.
const CTRL_SHIFT_EDITS: Record<string, ComposerChord> = {
  a: "selectAll",
  c: "copy",
  x: "cut",
  v: "paste",
  z: "redo",
};

// The composer's own key chords off macOS, where the field has to supply what
// WebKit's Cocoa bindings and the native Edit menu give it on a Mac. Returns
// null on macOS, for app chords and for keys the field handles natively
// (plain Ctrl+C/X/V copy, cut and paste).
export function composerChord(e: KeyEventLike, mac: boolean = isMac): ComposerChord | null {
  if (mac || !e.ctrlKey || e.metaKey || isAltGraphChar(e)) return null;
  const letter = chordLetter(e);
  if (!letter) return null;
  if (!e.altKey) return (e.shiftKey ? CTRL_SHIFT_EDITS : CTRL_EDITS)[letter] ?? null;
  if (!e.shiftKey) return null;
  if (letter === "t") return "newTab";
  if (letter === "w") return "closeTab";
  if (letter === "z") return "redo";
  return null;
}

const TEXT_NAV_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Backspace", "Delete"]);

// Ctrl chords the field keeps from the app's global shortcuts. macOS: every
// Ctrl chord (its ⌃ text bindings; app chords use ⌘). Elsewhere app chords are
// Ctrl+Shift/Ctrl+Alt forms too, so only plain Ctrl+letter and Ctrl-modified
// caret and delete keys stay in the field.
export function composerKeepsCtrlChord(e: KeyEventLike, mac: boolean = isMac): boolean {
  if (!e.ctrlKey || e.metaKey) return false;
  if (mac) return true;
  if (e.altKey) return false;
  if (TEXT_NAV_KEYS.has(e.key)) return true;
  return !e.shiftKey && chordLetter(e) !== null;
}

function modify(alter: "move" | "extend", direction: "forward" | "backward", granularity: string) {
  window.getSelection()?.modify(alter, direction, granularity);
}

function killTo(direction: "forward" | "backward", granularity: string) {
  const sel = window.getSelection();
  if (!sel) return;
  if (sel.isCollapsed) {
    sel.modify("extend", direction, granularity);
    // At a line edge the kill takes the line break, as ⌃K does on a Mac.
    if (sel.isCollapsed) sel.modify("extend", direction, "character");
  }
  if (!sel.isCollapsed) document.execCommand("delete");
}

export function runComposerEdit(edit: ComposerEdit): void {
  switch (edit) {
    case "lineStart":
      return modify("move", "backward", "lineboundary");
    case "lineEnd":
      return modify("move", "forward", "lineboundary");
    case "charBack":
      return modify("move", "backward", "character");
    case "charForward":
      return modify("move", "forward", "character");
    case "lineUp":
      return modify("move", "backward", "line");
    case "lineDown":
      return modify("move", "forward", "line");
    case "killLineEnd":
      return killTo("forward", "lineboundary");
    case "killLineStart":
      return killTo("backward", "lineboundary");
    case "killWordBack":
      return killTo("backward", "word");
    case "deleteForward":
      document.execCommand("forwardDelete");
      return;
    case "deleteBack":
      document.execCommand("delete");
      return;
    case "selectAll":
      document.execCommand("selectAll");
      return;
    case "copy":
      document.execCommand("copy");
      return;
    case "cut":
      document.execCommand("cut");
      return;
    case "noFormat":
      return;
  }
}

export function isFormatInput(inputType: string): boolean {
  return inputType.startsWith("format");
}

// Ctrl+B/I/U, which Chromium and WebKitGTK turn into bold, italic and underline
// inside a rich field (macOS binds those to ⌘, which the app owns).
export function isFormatChord(e: KeyEventLike, mac: boolean = isMac): boolean {
  if (mac || !e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
  const letter = chordLetter(e);
  return letter === "b" || letter === "i" || letter === "u";
}
