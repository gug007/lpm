import { useCallback, useEffect, useRef, useState } from "react";
import { useHoverPopup } from "../../hooks/useHoverPopup";
import type { LaunchpadProject } from "../../hooks/useLaunchpad";
import type { RunActionOpts } from "../../hooks/useProjectActions";
import type { RemoteAgentLaunch } from "../../remoteAgentTabs";
import type { ActionInfo } from "../../types";
import { NewTabPopup } from "./NewTabPopup";
import { TabStripPlus } from "./TabStripPlus";

// Long enough that reaching for + to click it doesn't flash the popup first.
const OPEN_DELAY_MS = 300;

interface AddTerminalButtonProps {
  project: LaunchpadProject;
  onAddTerminal: (shell?: string) => void;
  onRunCommand: (command: string, shell?: string) => void;
  onOpenAgent: (launch: RemoteAgentLaunch) => void;
  onRunAction: (action: ActionInfo, opts?: RunActionOpts) => void;
  onResumeSession?: () => void;
  // ⌘T asked for the popup here, with the keyboard in it.
  openRequested: boolean;
  onOpenRequestHandled: () => void;
}

// A click on + opens a terminal. Resting on it shows what else it opens — an
// agent with a first prompt, or a terminal running a command — and with
// "Pick agent and model on +" on, a click opens that instead. Right-click or ↓
// opens it without the wait.
export function AddTerminalButton({
  project,
  onAddTerminal,
  onRunCommand,
  onOpenAgent,
  onRunAction,
  onResumeSession,
  openRequested,
  onOpenRequestHandled,
}: AddTerminalButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popup = useHoverPopup(buttonRef, OPEN_DELAY_MS);
  const { show, hide, hold } = popup;
  const [focusRequest, setFocusRequest] = useState(0);

  const openOnPurpose = useCallback(() => {
    show();
    hold(true);
    setFocusRequest((n) => n + 1);
  }, [show, hold]);

  const close = useCallback(() => {
    hide();
    hold(false);
    setFocusRequest(0);
  }, [hide, hold]);

  useEffect(() => {
    if (!openRequested) return;
    openOnPurpose();
    onOpenRequestHandled();
  }, [openRequested, openOnPurpose, onOpenRequestHandled]);

  return (
    <>
      <TabStripPlus
        ref={buttonRef}
        open={popup.open}
        aria-haspopup="dialog"
        aria-expanded={popup.open}
        onAdd={() => {
          close();
          onAddTerminal();
        }}
        onPick={openOnPurpose}
        {...popup.trigger}
      />
      {popup.open && (
        <NewTabPopup
          project={project}
          anchorRef={buttonRef}
          focusRequest={focusRequest}
          hover={popup.panel}
          onPin={() => hold(true)}
          onClose={close}
          onNewTerminal={onAddTerminal}
          onRunCommand={onRunCommand}
          onOpenAgent={onOpenAgent}
          onRunAction={onRunAction}
          onResumeSession={onResumeSession}
        />
      )}
    </>
  );
}
