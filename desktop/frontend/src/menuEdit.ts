import { EventsOn } from "../bridge/runtime";

// The Edit menu's Select All, Undo and Redo are custom items (menu.rs). Select
// All because the native action only selects Monaco's hidden textarea fragment;
// Undo/Redo because the native items are disabled — and swallow ⌘Z/⌘⇧Z without
// a keydown — whenever WebKit's own history is empty, which a field keeping its
// own undo stack (the terminal composer) can't live with. Each event is emitted
// to every window; only the focused one acts. A cancelable window event lets
// editors that manage their own state claim it; otherwise fall back to the
// native-equivalent behavior.
function onMenu(event: string, claimEvent: string, fallback: () => void) {
  EventsOn(event, () => {
    if (!document.hasFocus()) return;
    const claimed = !window.dispatchEvent(new CustomEvent(claimEvent, { cancelable: true }));
    if (!claimed) fallback();
  });
}

// Select All covers the focused field only: with nothing editable focused it
// would select the app's own labels and buttons across the whole window.
export function selectAllInFocus(el: Element | null = document.activeElement) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.select();
  } else if (el instanceof HTMLElement && el.isContentEditable) {
    document.execCommand("selectAll");
  }
}

export function initMenuEditEvents() {
  onMenu("menu-select-all", "lpm-menu-select-all", () => selectAllInFocus());
  onMenu("menu-undo", "lpm-menu-undo", () => document.execCommand("undo"));
  onMenu("menu-redo", "lpm-menu-redo", () => document.execCommand("redo"));
}
