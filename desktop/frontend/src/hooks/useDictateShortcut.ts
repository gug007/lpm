import { useMemo } from "react";
import { resolveHotkey } from "../hotkeys";
import { formatShortcut, parseShortcut } from "../shortcutParse";
import { useSettingsStore } from "../store/settings";
import type { KeyboardShortcut } from "./useKeyboardShortcut";

/** The Dictate hotkey as set in Settings › Shortcuts, and how it reads. */
export function useDictateShortcut(): { shortcut: KeyboardShortcut | null; label: string | null } {
  const hotkeys = useSettingsStore((s) => s.hotkeys);
  return useMemo(() => {
    const shortcut = parseShortcut(resolveHotkey(hotkeys, "dictate"));
    return { shortcut, label: shortcut ? formatShortcut(shortcut) : null };
  }, [hotkeys]);
}
