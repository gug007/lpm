import { useMemo } from "react";
import { useKeyboardShortcut, type KeyboardShortcut } from "./useKeyboardShortcut";
import { canonicalShortcut, parseShortcut } from "../shortcutParse";
import { resolveHotkey, type HotkeyId } from "../hotkeys";
import { useSettingsStore } from "../store/settings";
import { adjacentPaneId } from "../paneMoves";
import type { PaneLeaf, PaneNode } from "../paneTree";
import { filesChord } from "../components/files/useFilesChords";

interface PaneMove {
  kind: "tab" | "pane";
  dir: 1 | -1;
}

const ENTRIES: Array<[HotkeyId, PaneMove]> = [
  ["tabSwitchNext", { kind: "tab", dir: 1 }],
  ["tabSwitchPrev", { kind: "tab", dir: -1 }],
  ["paneFocusNext", { kind: "pane", dir: 1 }],
  ["paneFocusPrev", { kind: "pane", dir: -1 }],
];

interface UsePaneNavKeysProps {
  enabled: boolean;
  tree: PaneNode | null;
  // A maximized pane hides the others, so there is no pane to move to.
  maximized: boolean;
  services: { name: string }[];
  getFocusedPane: () => PaneLeaf | null;
  focusAdjacentPaneItem: (paneId: string, delta: 1 | -1, serviceNames: string[]) => void;
  focusPane: (paneId: string) => void;
  // Puts the keyboard in what the pane shows; false when nothing there takes it.
  focusPaneContent: (paneId: string) => boolean;
}

// Next/previous tab within the focused pane, and next/previous pane, on the
// keys set in Settings › Shortcuts. The combos carry ⌘ to escape the
// interactive terminal's key handler (it only forwards non-meta keys to the
// agent); capture phase because a configured combo may carry Ctrl, which the
// composer stops.
export function usePaneNavKeys({
  enabled,
  tree,
  maximized,
  services,
  getFocusedPane,
  focusAdjacentPaneItem,
  focusPane,
  focusPaneContent,
}: UsePaneNavKeysProps) {
  const hotkeys = useSettingsStore((s) => s.hotkeys);
  const { shortcuts, moveByCanonical } = useMemo(() => {
    const shortcuts: KeyboardShortcut[] = [];
    const moveByCanonical = new Map<string, PaneMove>();
    for (const [id, move] of ENTRIES) {
      const parsed = parseShortcut(resolveHotkey(hotkeys, id));
      if (!parsed) continue;
      const canon = canonicalShortcut(parsed);
      if (moveByCanonical.has(canon)) continue;
      moveByCanonical.set(canon, move);
      shortcuts.push(parsed);
    }
    return { shortcuts, moveByCanonical };
  }, [hotkeys]);

  // The input follows along when it had the focus; otherwise what the pane
  // shows takes it.
  const focusInside = (paneId: string, fromInput: boolean) => {
    const input = fromInput
      ? document.querySelector<HTMLElement>("[data-focused-pane] [data-terminal-composer]")
      : null;
    if (input) input.focus();
    else if (!focusPaneContent(paneId) && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  useKeyboardShortcut(
    shortcuts,
    (event, matched) => {
      const move = moveByCanonical.get(canonicalShortcut(matched));
      const pane = getFocusedPane();
      if (!move || !pane) return;
      if (move.kind === "tab") {
        focusAdjacentPaneItem(pane.id, move.dir, services.map((s) => s.name));
        return;
      }
      // ⌃⌥↑ / ⌃⌥↓ step through files, and Ctrl matches ⌘ here on macOS.
      if (filesChord(event)) return;
      if (!tree || maximized) return;
      const next = adjacentPaneId(tree, pane.id, move.dir);
      if (!next) return;
      // The file editor binds ⌘⌥↑ / ⌘⌥↓ too (add a cursor), and it would act
      // on the keys as well.
      event.stopPropagation();
      const fromInput = !!document.activeElement?.closest("[data-terminal-composer]");
      focusPane(next);
      requestAnimationFrame(() => focusInside(next, fromInput));
    },
    enabled && shortcuts.length > 0,
    true,
  );
}
