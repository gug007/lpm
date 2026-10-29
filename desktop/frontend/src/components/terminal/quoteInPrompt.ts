import type { Terminal } from "@xterm/xterm";
import { useComposerStore } from "../../store/composer";
import { insertComposerText } from "../../store/composerDrafts";
import { useTerminalTargets, type TerminalTargetInfo } from "../../store/terminalTargets";
import { formatQuote } from "../composerQuote";
import { terminalSelectionText } from "./copySelection";

// The input a terminal's selection can be quoted into; only a project terminal
// has one.
export function quoteTarget(terminalId: string): TerminalTargetInfo | null {
  for (const targets of Object.values(useTerminalTargets.getState().byProject)) {
    const target = targets.find((t) => t.id === terminalId);
    if (target) return target;
  }
  return null;
}

// The selection, cleaned the way Copy cleans it, into the target's input as a
// quote. A closed input opens with the quote in it.
export function quoteSelectionInPrompt(term: Terminal, target: TerminalTargetInfo): void {
  const text = terminalSelectionText(term);
  if (!text) return;
  if (!insertComposerText(target.id, target.historyKey, formatQuote(text), true)) {
    useComposerStore.getState().setOpen(true);
  }
  term.clearSelection();
}
