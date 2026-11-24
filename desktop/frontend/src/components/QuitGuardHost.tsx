import { useEffect } from "react";
import { QuitRequestHeard } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import {
  cancelQuit,
  checkWaitingToQuit,
  quitNow,
  quitWhenAgentsFinish,
  requestQuit,
  useQuitGuard,
} from "../quitGuard";
import { onStatusEntriesChange } from "../projectStatusEntries";
import { QuitBusyAgentsDialog } from "./QuitBusyAgentsDialog";

/** The app menu's Quit, asked here first: agents mid-task are listed and the
 *  user picks whether to end them now or once they are done. Pressing Quit
 *  again while asked quits at once. */
export function QuitGuardHost() {
  const asking = useQuitGuard((s) => s.asking);
  const waiting = useQuitGuard((s) => s.waiting);

  useEffect(
    () =>
      EventsOn("menu-quit", (seq: number) => {
        void QuitRequestHeard(seq).catch(() => {});
        requestQuit();
      }),
    [],
  );

  useEffect(() => {
    if (!waiting) return;
    checkWaitingToQuit();
    return onStatusEntriesChange(checkWaitingToQuit);
  }, [waiting]);

  return (
    <QuitBusyAgentsDialog
      places={asking}
      onCancel={cancelQuit}
      onQuitNow={quitNow}
      onQuitWhenDone={quitWhenAgentsFinish}
    />
  );
}
