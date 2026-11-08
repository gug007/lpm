import { PencilIcon, RefreshIcon, StopIcon } from "../icons";
import { Tooltip } from "../ui/Tooltip";
import { FoldRepeatsToggle } from "./FoldRepeatsToggle";
import { ServicePortLinks } from "./ServicePortLinks";

interface ServiceColumnActionsProps {
  projectName: string;
  paneId: string;
  name: string;
  sessionKey: string;
  ports: number[];
  configuredPort?: number;
  exited: boolean;
  onRestart: () => void;
  onStop: () => void;
  onEdit?: () => void;
}

const BUTTON =
  "flex items-center rounded p-0.5 text-[var(--terminal-header-text)] transition-colors hover:bg-[var(--terminal-header-hover)] hover:text-[var(--terminal-tab-active)] [&>svg]:h-3 [&>svg]:w-3";

// The right end of a service's bar, on its own pane and on its column in the
// All view: where it listens, and restart/stop/edit without leaving the view.
export function ServiceColumnActions({ projectName, paneId, name, sessionKey, ports, configuredPort, exited, onRestart, onStop, onEdit }: ServiceColumnActionsProps) {
  return (
    <>
      <FoldRepeatsToggle sessionKey={sessionKey} />
      {!exited && ports.length > 0 && (
        <ServicePortLinks
          projectName={projectName}
          ports={ports}
          service={name}
          paneId={paneId}
          configuredPort={configuredPort}
          className="mr-1"
        />
      )}
      <Tooltip content={`Restart ${name}`} side="bottom" align="end">
        <button type="button" onClick={onRestart} aria-label={`Restart ${name}`} className={BUTTON}>
          <RefreshIcon />
        </button>
      </Tooltip>
      {!exited && (
        <Tooltip content={`Stop ${name}`} side="bottom" align="end">
          <button type="button" onClick={onStop} aria-label={`Stop ${name}`} className={BUTTON}>
            <StopIcon />
          </button>
        </Tooltip>
      )}
      {onEdit && (
        <Tooltip content={`Edit ${name}`} side="bottom" align="end">
          <button type="button" onClick={onEdit} aria-label={`Edit ${name}`} className={BUTTON}>
            <PencilIcon />
          </button>
        </Tooltip>
      )}
    </>
  );
}
