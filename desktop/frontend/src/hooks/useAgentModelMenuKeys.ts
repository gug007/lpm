import { useEffect, type RefObject } from "react";

// Keys the menu owns while it is open. Anything else that carries text closes it
// and is left to the composer, so typing a prompt is never swallowed.
const NAV_KEYS = new Set(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"]);

interface Options {
  open: boolean;
  /** Values of the column the cursor is in, in row order. */
  list: string[];
  /** The cursor's value within that column. */
  current: string;
  /** Whether the other column has anything to move into. */
  hasOtherColumn: boolean;
  /** Which side of the list the level flyout opens on, so the arrow that leads
   *  into it is the one pointing at it. */
  flyoutSide: "left" | "right";
  /** Set true by the first key that moves the cursor. Enter only commits after
   *  that: a menu opened with the mouse and left alone must not take an Enter
   *  the user meant for the prompt they were writing. */
  used: RefObject<boolean>;
  move: (value: string) => void;
  toOtherColumn: (forward: boolean) => void;
  commit: () => void;
  close: () => void;
}

/**
 * Keyboard for the composer's model menu, read off the document in the capture
 * phase rather than from DOM focus: the composer is a contenteditable whose
 * caret every control in that row is built to leave alone, so the menu never
 * takes focus. Capture means the editor's own handlers don't see the keys the
 * menu owns — and, just as deliberately, do see every key it doesn't.
 */
export function useAgentModelMenuKeys({
  open,
  list,
  current,
  hasOtherColumn,
  flyoutSide,
  used,
  move,
  toOtherColumn,
  commit,
  close,
}: Options): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // A composing IME owns Enter and the arrows for its candidate list.
      if (e.isComposing || e.keyCode === 229) return;
      const modified = e.metaKey || e.ctrlKey || e.altKey;
      if (e.key === "Escape" && !modified) {
        e.stopPropagation();
        close();
        return;
      }
      if (modified || e.shiftKey) {
        // ⌘↵ and ⇧/⌥/⌘+Arrow belong to the composer and the window, never here.
        if (NAV_KEYS.has(e.key) || e.key === "Enter") close();
        return;
      }
      const take = () => {
        e.preventDefault();
        e.stopPropagation();
        used.current = true;
      };
      const step = (to: number) => {
        take();
        if (list.length > 0) move(list[Math.max(0, Math.min(list.length - 1, to))]);
      };
      const at = list.indexOf(current);
      const into = flyoutSide === "right" ? "ArrowRight" : "ArrowLeft";
      const back = flyoutSide === "right" ? "ArrowLeft" : "ArrowRight";
      switch (e.key) {
        case "ArrowDown":
          return step(at + 1);
        case "ArrowUp":
          return step(at < 0 ? 0 : at - 1);
        case "Home":
          return step(0);
        case "End":
          return step(list.length - 1);
        case into:
          take();
          if (hasOtherColumn) toOtherColumn(true);
          return;
        case back:
          take();
          toOtherColumn(false);
          return;
        case "Enter":
          if (!used.current) {
            // Opened with the mouse and never navigated: this Enter is the
            // composer's, so step aside rather than switch a model silently.
            close();
            return;
          }
          take();
          commit();
          return;
      }
      // Anything that types closes the menu and reaches the composer intact.
      if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") close();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, list, current, hasOtherColumn, flyoutSide, used, move, toOtherColumn, commit, close]);
}
