import type { RefObject } from "react";
import { HideQuickTerminal, TerminalForegroundCommand, WriteTerminal } from "../../../bridge/commands";
import { useEventListener } from "../../hooks/useEventListener";
import { isImeComposing } from "../../imeComposing";
import { isShellAtPrompt } from "../../shellCommand";

function isEmptyField(el: EventTarget | null): boolean {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value === "";
  if (el instanceof HTMLElement && el.isContentEditable) return !el.textContent?.trim();
  return true;
}

// Esc hides the quick terminal, without taking Esc away from what needs it: in
// the terminal it hides only while the shell waits at its prompt, and otherwise
// still reaches the program running there (vim, an agent); in the input it
// hides only when there's nothing typed and nothing else used the key.
export function useQuickTerminalEscape(
  terminalId: string | null,
  terminalBox: RefObject<HTMLElement | null>,
): void {
  useEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || isImeComposing(e) || !terminalId) return;
      if (!(e.target instanceof Node) || !terminalBox.current?.contains(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void TerminalForegroundCommand(terminalId).then((cmd: string) =>
        isShellAtPrompt(cmd) ? HideQuickTerminal() : WriteTerminal(terminalId, "\x1b"),
      );
    },
    window,
    true,
    true,
  );

  useEventListener("keydown", (e) => {
    if (e.key !== "Escape" || isImeComposing(e) || e.defaultPrevented) return;
    if (e.target instanceof Node && terminalBox.current?.contains(e.target)) return;
    if (isEmptyField(e.target)) void HideQuickTerminal();
  });
}
