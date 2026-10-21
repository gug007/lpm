import { useEffect, type RefObject } from "react";
import { isImeComposing } from "../imeComposing";

// Keys the menu owns while it is open. Anything else that carries text closes it
// and is left to the composer, so typing a prompt is never swallowed.
const NAV_KEYS = new Set(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"]);

interface Options {
  open: boolean;
  /** Every model, in row order. */
  models: string[];
  /** The levels the cursor's model takes, in row order. */
  levels: string[];
  model: string;
  effort: string;
  /** Set true by the first key that moves the cursor. Enter only commits after
   *  that: a menu opened with the mouse and left alone must not take an Enter
   *  the user meant for the prompt they were writing. */
  used: RefObject<boolean>;
  moveModel: (value: string) => void;
  moveLevel: (value: string) => void;
  commit: () => void;
  close: () => void;
}

function clampedAt<T>(list: T[], index: number): T | undefined {
  return list[Math.max(0, Math.min(list.length - 1, index))];
}

/**
 * Keyboard for the composer's model menu, read off the document in the capture
 * phase rather than from DOM focus: the composer is a contenteditable whose
 * caret every control in that row is built to leave alone, so the menu never
 * takes focus. Capture means the editor's own handlers don't see the keys the
 * menu owns — and, just as deliberately, do see every key it doesn't.
 * ↑↓ move between models, ←→ between the levels of the one under the cursor.
 */
export function useAgentModelMenuKeys({
  open,
  models,
  levels,
  model,
  effort,
  used,
  moveModel,
  moveLevel,
  commit,
  close,
}: Options): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // A composing IME owns Enter and the arrows for its candidate list.
      if (isImeComposing(e)) return;
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
      const toModel = (index: number) => {
        take();
        const next = clampedAt(models, index);
        if (next !== undefined) moveModel(next);
      };
      const toLevel = (index: number) => {
        take();
        const next = clampedAt(levels, index);
        if (next !== undefined) moveLevel(next);
      };
      const modelAt = models.indexOf(model);
      const levelAt = levels.indexOf(effort);
      switch (e.key) {
        case "ArrowDown":
          return toModel(modelAt + 1);
        case "ArrowUp":
          return toModel(modelAt < 0 ? 0 : modelAt - 1);
        case "Home":
          return toModel(0);
        case "End":
          return toModel(models.length - 1);
        case "ArrowRight":
          return toLevel(levelAt < 0 ? 0 : levelAt + 1);
        case "ArrowLeft":
          return toLevel(levelAt < 0 ? levels.length - 1 : levelAt - 1);
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
  }, [open, models, levels, model, effort, used, moveModel, moveLevel, commit, close]);
}
