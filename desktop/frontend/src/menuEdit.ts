import { EventsOn } from "../bridge/runtime";

// The Edit menu's Select All is a custom item (menu.rs) because the native
// action only selects Monaco's hidden textarea fragment. Its event is emitted
// to every window; only the focused one acts. A cancelable window event lets
// editors that manage their own selection (MonacoEditor) claim it; otherwise
// fall back to the native-equivalent behavior for inputs and contenteditables.
export function initMenuEditEvents() {
  EventsOn("menu-select-all", () => {
    if (!document.hasFocus()) return;
    const claimed = !window.dispatchEvent(
      new CustomEvent("lpm-menu-select-all", { cancelable: true }),
    );
    if (claimed) return;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.select();
    } else {
      document.execCommand("selectAll");
    }
  });
}
