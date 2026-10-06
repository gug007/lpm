import { useEventListener } from "../../hooks/useEventListener";
import { isAltGraphChar } from "../../keyEvents";
import { matchesChord, type Chord } from "../../keys";
import { isMac } from "../../platform";

export type FilesChord =
  | "save"
  | "togglePreview"
  | "nextFile"
  | "prevFile"
  | "reveal"
  | "copyPath"
  | "copyRelativePath";

function insideMonaco(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".monaco-editor") !== null;
}

// Off macOS the ⌘ chords take their keys.ts toPhysical forms, Ctrl+S saves as
// in any editor, and Ctrl+Alt+PageDown / PageUp step files (Ctrl+Alt+arrows
// switch workspaces there).
const PC_CHORDS: Array<[FilesChord, Chord]> = [
  ["save", { key: "s", meta: true }],
  ["togglePreview", { key: "v", meta: true, shift: true }],
  ["reveal", { key: "r", meta: true, alt: true }],
  ["copyPath", { key: "c", meta: true, alt: true }],
  ["copyRelativePath", { key: "c", meta: true, alt: true, shift: true }],
  ["nextFile", { key: "PageDown", meta: true, alt: true }],
  ["prevFile", { key: "PageUp", meta: true, alt: true }],
];

function pcFilesChord(e: KeyboardEvent): FilesChord | null {
  if (isAltGraphChar(e)) return null;
  if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === "s") {
    return "save";
  }
  return PC_CHORDS.find(([, chord]) => matchesChord(e, chord, false))?.[0] ?? null;
}

// ⌘S saves; ⌘⇧V flips a Markdown file between preview and source; ⌃⌥↓ / ⌃⌥↑
// step through files (⌥-arrows alone are Monaco's move-line); ⌘⌥R / ⌘⌥C /
// ⌘⌥⇧C act on the file's path. With ⌥ held macOS
// reports the composed character ("ç" for ⌥C) in `key`, so the letter chords
// match the physical key instead.
export function filesChord(e: KeyboardEvent, mac: boolean = isMac): FilesChord | null {
  if (!mac) return pcFilesChord(e);
  if (e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey) {
    if (e.key === "ArrowDown") return "nextFile";
    if (e.key === "ArrowUp") return "prevFile";
    return null;
  }
  if (!e.metaKey || e.ctrlKey) return null;
  if (!e.altKey) {
    const key = e.key.toLowerCase();
    if (!e.shiftKey && key === "s") return "save";
    if (e.shiftKey && key === "v") return "togglePreview";
    return null;
  }
  switch (e.code) {
    case "KeyR":
      return e.shiftKey ? null : "reveal";
    case "KeyC":
      return e.shiftKey ? "copyRelativePath" : "copyPath";
    default:
      return null;
  }
}

// Chords for the Files tab in the focused pane, matched in the capture phase so
// Monaco's own bindings on the same keys (find-widget toggles, add cursor) never
// see them. Monaco keeps ⌘S (Ctrl+S off macOS) while it has focus: it saves
// through its own command, and letting both fire would write twice.
export function useFilesChords(enabled: boolean, handlers: Record<FilesChord, () => void>) {
  useEventListener(
    "keydown",
    (e) => {
      if (document.querySelector("[data-modal-overlay]")) return;
      const chord = filesChord(e);
      if (!chord) return;
      if (chord === "save" && !e.shiftKey && insideMonaco(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      handlers[chord]();
    },
    window,
    enabled,
    true,
  );
}
