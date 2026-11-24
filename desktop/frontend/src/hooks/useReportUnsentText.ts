import { useCallback } from "react";
import { TerminalUnsentText } from "../../bridge/commands";
import { IS_MIRROR_WINDOW } from "../mirror";
import { noteUnsentElsewhere } from "../store/composerDrafts";

const OWN_WINDOW = "window";
// Another computer's composer, told apart from any other's.
const THIS_COMPUTER = crypto.randomUUID();

// The terminals whose composer here was last reported to hold unsent text: the
// composer comes and goes with its tab, and what it holds stays.
const reported = new Set<string>();

// Tells the window a terminal's tab is in whether a composer it doesn't hold has
// unsent text: a detached window's, or this one's for a project on another
// computer. Closing the tab would lose that text too.
export function useReportUnsentText(terminalId: string, onOtherComputer: boolean, guest: boolean) {
  return useCallback(
    (unsent: boolean) => {
      if (guest) return;
      if (!onOtherComputer && !IS_MIRROR_WINDOW) return noteUnsentElsewhere(terminalId, OWN_WINDOW, false);
      if (reported.has(terminalId) === unsent) return;
      if (unsent) reported.add(terminalId);
      else reported.delete(terminalId);
      void TerminalUnsentText(terminalId, onOtherComputer ? THIS_COMPUTER : OWN_WINDOW, unsent).catch(() => {});
    },
    [terminalId, onOtherComputer, guest],
  );
}
