import { answerClose, cancelClose, useCloseGuard } from "../closeGuard";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { CloseBusyAgentsDialog } from "./CloseBusyAgentsDialog";

const closeNow = () => answerClose((q) => q.closeNow);

/** Asks before a tab closes on an agent mid-task. ⌘W again closes it at once;
 *  a held ⌘W is not a second press. */
export function CloseGuardHost() {
  const asking = useCloseGuard((s) => s.asking);

  useKeyboardShortcut(
    { key: "w", meta: true, shift: false, alt: false, cmdOnly: true },
    (event) => {
      // The close it runs takes the dialog away, and with it what keeps ⌘W from
      // the tab that is on screen next.
      event.stopPropagation();
      if (!event.repeat) closeNow();
    },
    asking?.what === "tab",
    true,
  );

  return (
    <CloseBusyAgentsDialog
      question={asking}
      onCancel={cancelClose}
      onCloseNow={closeNow}
      onCloseWhenDone={() => answerClose((q) => q.closeWhenDone)}
      onKeepOpen={() => answerClose((q) => q.keepOpen)}
    />
  );
}
