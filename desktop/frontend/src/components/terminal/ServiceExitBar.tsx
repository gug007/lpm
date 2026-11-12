import { RefreshIcon } from "../icons";
import { serviceCrashed, serviceExitText } from "../../serviceExit";
import { useServiceLogs } from "../../store/serviceLogs";
import { FixWithAgentButton } from "../FixWithAgentButton";
import { paneSessionText } from "../Pane";
import { serviceCrashPrompt } from "./serviceErrorPrompt";

interface ServiceExitBarProps {
  projectName: string;
  name: string;
  cmd?: string;
  sessionKey: string;
  exitCode: number | null;
  onRestart: () => void;
}

const BAR_BUTTON =
  "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]";

// Under a service whose command has ended. The pane alone can't tell a crash
// from a server that is just quiet, so this says which, runs it again, and
// after a crash shows what it logged or hands that to an agent.
export function ServiceExitBar({ projectName, name, cmd, sessionKey, exitCode, onRestart }: ServiceExitBarProps) {
  const crashed = serviceCrashed({ exited: true, exitCode });
  const errors = useServiceLogs((s) => s.counts[sessionKey]?.errors ?? 0);
  const filtered = useServiceLogs((s) => s.filter[sessionKey] === "error");
  const setFilter = useServiceLogs((s) => s.setFilter);
  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-[12px]"
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          crashed ? "bg-[var(--accent-red)]" : "bg-[var(--text-muted)]"
        }`}
      />
      <span
        className={`min-w-0 flex-1 truncate ${
          crashed ? "text-[var(--accent-red-text)]" : "text-[var(--text-secondary)]"
        }`}
      >
        <span className="font-mono">{name}</span> {serviceExitText({ exitCode })}
      </span>
      {crashed && errors > 0 && !filtered && (
        <button type="button" onClick={() => setFilter(sessionKey, "error")} className={BAR_BUTTON}>
          Show errors
          <span className="tabular-nums text-[var(--accent-red-text)]">{errors > 99 ? "99+" : errors}</span>
        </button>
      )}
      {crashed && (
        <FixWithAgentButton
          projectName={projectName}
          prompt={() => serviceCrashPrompt(name, cmd, exitCode, paneSessionText(sessionKey))}
          description={`Opens a new tab with ${name}'s errors`}
          side="top"
          className={BAR_BUTTON}
        />
      )}
      <button type="button" onClick={onRestart} className={BAR_BUTTON}>
        <RefreshIcon />
        Restart
      </button>
    </div>
  );
}
