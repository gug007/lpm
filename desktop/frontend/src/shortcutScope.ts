import type { KeyboardShortcut } from "./hooks/useKeyboardShortcut";

// Marks a focus context that owns its own text editing. Global shortcuts stay
// live inside one unless they opt out with `whileTyping: false`, so a newly
// added shortcut works by default instead of being silently swallowed until
// someone remembers to allowlist it.
//
// An explicit attribute rather than a tag/contentEditable heuristic: xterm's own
// input surface is a <textarea>, and ⌘D / ⌘F are meant to work from there.
export const TEXT_SCOPE_SELECTOR = "[data-text-scope]";

export function inTextScope(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TEXT_SCOPE_SELECTOR) !== null;
}

export function firesForTarget(s: KeyboardShortcut, target: EventTarget | null): boolean {
  return s.whileTyping !== false || !inTextScope(target);
}
