import { useEventListener } from "../../hooks/useEventListener";

export type FilesChord =
  | "save"
  | "nextFile"
  | "prevFile"
  | "reveal"
  | "copyPath"
  | "copyRelativePath";

function insideMonaco(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".monaco-editor") !== null;
}

// ⌘S saves; ⌃⌥↓ / ⌃⌥↑ step through files (⌥-arrows alone are Monaco's
// move-line); ⌘⌥R / ⌘⌥C / ⌘⌥⇧C act on the file's path. With ⌥ held macOS
// reports the composed character ("ç" for ⌥C) in `key`, so the letter chords
// match the physical key instead.
export function filesChord(e: KeyboardEvent): FilesChord | null {
  if (e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey) {
    if (e.key === "ArrowDown") return "nextFile";
    if (e.key === "ArrowUp") return "prevFile";
    return null;
  }
  if (!e.metaKey || e.ctrlKey) return null;
  if (!e.altKey) return !e.shiftKey && e.key.toLowerCase() === "s" ? "save" : null;
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
// see them. Monaco keeps ⌘S while it has focus: it saves through its own
// command, and letting both fire would write twice.
export function useFilesChords(enabled: boolean, handlers: Record<FilesChord, () => void>) {
  useEventListener(
    "keydown",
    (e) => {
      if (document.querySelector("[data-modal-overlay]")) return;
      const chord = filesChord(e);
      if (!chord) return;
      if (chord === "save" && insideMonaco(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      handlers[chord]();
    },
    window,
    enabled,
    true,
  );
}
