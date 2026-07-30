import { useMemo } from "react";
import { resolveHotkey } from "../hotkeys";
import { formatShortcut, parseShortcut } from "../shortcutParse";
import { useSettingsStore } from "../store/settings";
import { useKeyboardShortcut } from "./useKeyboardShortcut";

export function useAgentOverviewShortcut(onToggle: () => void): string | null {
  const hotkeys = useSettingsStore((state) => state.hotkeys);
  const shortcut = useMemo(() => {
    const parsed = parseShortcut(resolveHotkey(hotkeys, "toggleAgentOverview"));
    return parsed ? { ...parsed, preventDefault: false } : null;
  }, [hotkeys]);

  useKeyboardShortcut(
    shortcut ?? [],
    (event) => {
      if (document.querySelector("[data-modal-overlay]")) return;
      event.preventDefault();
      onToggle();
    },
    shortcut !== null,
  );

  return shortcut ? formatShortcut(shortcut) : null;
}
