import { hasPrimaryMod } from "../keyEvents";
import { useAppStore } from "../store/app";
import { useSettingsReturn } from "../store/settingsReturn";
import { useKeyboardShortcut, type KeyboardShortcut } from "./useKeyboardShortcut";

// Shift is left open: some layouts (German, French) type "/" with it.
const SHORTCUT: KeyboardShortcut = { key: "/", meta: true, alt: false, inCodeEditor: false };

// ⌘/ (Ctrl+/ elsewhere) opens Settings › Shortcuts, and from there goes back to
// where it was pressed. The file editor keeps it for commenting out a line, and
// on macOS ⌃/ stays with the terminal.
export function useShortcutsPageKey() {
  useKeyboardShortcut(SHORTCUT, (event) => {
    if (!hasPrimaryMod(event)) return;
    const app = useAppStore.getState();
    if (app.view === "settings" && app.settingsTab === "shortcuts") {
      app.setView(useSettingsReturn.getState().from);
    } else {
      app.openSettingsTab("shortcuts");
    }
  });
}
