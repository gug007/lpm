import { isLinux } from "./platform";

const TAB = 9;

// WebKitGTK reports Shift+Tab (GDK's ISO_Left_Tab) as key "Unidentified", so
// whatever goes by name misses it: in the Kitty keyboard mode Claude Code asks
// for, xterm sends nothing and leaves the key to move the focus.
export function nameBackTab(e: KeyboardEvent): void {
  if (e.key === "Unidentified" && e.keyCode === TAB) Object.defineProperty(e, "key", { value: "Tab" });
}

// Capture phase on the window, installed before the app's own listeners, so
// every one of them reads the name.
export function installBackTab(linux: boolean = isLinux): void {
  if (!linux) return;
  window.addEventListener("keydown", nameBackTab, true);
  window.addEventListener("keyup", nameBackTab, true);
}
