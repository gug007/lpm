import { BrowserOpenURL } from "../../bridge/runtime";
import type { FleetProjectIdentity } from "../fleetIdentity";
import { FleetTags } from "./FleetTags";
import { PlayIcon, ServerIcon, StopIcon } from "./icons";

export interface FleetServiceRowProps {
  project: FleetProjectIdentity;
  service: string;
  running: boolean;
  /** The port it is listening on, or the one it declares while detection catches
   *  up. Null when neither is known, or while it is stopped. */
  port: number | null;
  onToggle: () => void;
  onOpenProject: () => void;
}

export function FleetServiceRow({
  project,
  service,
  running,
  port,
  onToggle,
  onOpenProject,
}: FleetServiceRowProps) {
  return (
    <div className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--bg-hover)]">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--bg-hover)] text-[var(--text-muted)]">
        <ServerIcon />
      </span>

      <button
        type="button"
        onClick={onOpenProject}
        title={`Open ${project.label}`}
        className="min-w-0 flex-1 text-left focus-visible:outline-none"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text-primary)]">
            {project.label}
          </span>
          <FleetTags project={project} />
          <span className="min-w-0 truncate text-[12px] text-[var(--text-muted)]">
            {service}
          </span>
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              running
                ? "bg-[var(--accent-green)]"
                : "border border-[var(--text-muted)]"
            }`}
          />
          <span
            className={`shrink-0 ${running ? "text-[var(--accent-green-text)]" : ""}`}
          >
            {running ? "Running" : "Stopped"}
          </span>
        </span>
      </button>

      <span className="flex w-24 shrink-0 justify-end">
        {port !== null && (
          <button
            type="button"
            onClick={() => BrowserOpenURL(`http://localhost:${port}`)}
            aria-label={`Open ${service} at localhost:${port}`}
            title={`Open http://localhost:${port}`}
            className="rounded-md px-1 py-0.5 font-mono text-[12px] tabular-nums text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-blue)] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
          >
            :{port}
          </button>
        )}
      </span>

      <button
        type="button"
        onClick={onToggle}
        aria-label={`${running ? "Stop" : "Start"} ${service} in ${project.label}`}
        title={running ? "Stop this service" : "Start this service"}
        className="shrink-0 rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
      >
        {running ? <StopIcon /> : <PlayIcon />}
      </button>
    </div>
  );
}
