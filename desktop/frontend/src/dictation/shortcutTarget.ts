import { captureDictationTarget } from "./insert";

const COMPOSER_EDITOR = '[data-composer-box] [contenteditable="true"]';

/** Where the Dictate shortcut sends the words: the field you're typing in, or,
 *  from a terminal, the input under the focused pane. Null when neither is
 *  on screen (the input hidden, say). */
export function dictationShortcutField(active: Element | null = document.activeElement): HTMLElement | null {
  if (active instanceof HTMLElement && !active.closest(".xterm") && captureDictationTarget(active)) return active;
  const pane = active?.closest("[data-focused-pane]") ?? document.querySelector("[data-focused-pane]");
  return pane?.querySelector<HTMLElement>(COMPOSER_EDITOR) ?? null;
}
