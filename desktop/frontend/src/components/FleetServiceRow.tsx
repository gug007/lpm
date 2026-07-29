import { BrowserOpenURL } from "../../bridge/runtime";
import type { FleetChip, FleetServiceGroup } from "../fleetRows";
import { FleetTags } from "./FleetTags";
import { PlayIcon, ServerIcon, StopIcon } from "./icons";

/** A running service and the port it answers on. */
export interface FleetServiceLink {
  service: string;
  port: number;
}

export interface FleetServiceRowProps {
  group: FleetServiceGroup;
  links: FleetServiceLink[];
  onRunChip: (chip: FleetChip) => void;
  onStop: () => void;
  onOpenProject: () => void;
}

export function FleetServiceRow({
  group,
  links,
  onRunChip,
  onStop,
  onOpenProject,
}: FleetServiceRowProps) {
  const { project, chips } = group;

  return (
    <div className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--bg-hover)]">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--bg-hover)] text-[var(--text-muted)]">
        <ServerIcon />
      </span>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpenProject}
          title={`Open ${project.label}`}
          className="flex min-w-0 max-w-full items-center gap-2 text-left focus-visible:outline-none"
        >
          <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text-primary)]">
            {project.label}
          </span>
          <FleetTags project={project} />
        </button>

        <div className="mt-1 flex flex-wrap items-center gap-1">
          {chips.map((chip) => (
            <ChipButton
              key={`${chip.kind}/${chip.name}`}
              chip={chip}
              projectLabel={project.label}
              onClick={() => onRunChip(chip)}
            />
          ))}
        </div>
      </div>

      <span className="flex shrink-0 items-center gap-1">
        {links.map((link) => (
          <button
            key={link.service}
            type="button"
            onClick={() => BrowserOpenURL(`http://localhost:${link.port}`)}
            aria-label={`Open ${link.service} at localhost:${link.port}`}
            title={`Open ${link.service} — http://localhost:${link.port}`}
            className="rounded-md px-1 py-0.5 font-mono text-[12px] tabular-nums text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-blue)] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
          >
            :{link.port}
          </button>
        ))}
      </span>

      <button
        type="button"
        onClick={onStop}
        aria-label={`Stop ${project.label}`}
        title="Stop everything in this project"
        className="shrink-0 rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
      >
        <StopIcon />
      </button>
    </div>
  );
}

interface ChipButtonProps {
  chip: FleetChip;
  projectLabel: string;
  onClick: () => void;
}

function ChipButton({ chip, projectLabel, onClick }: ChipButtonProps) {
  const noun = chip.kind === "profile" ? "profile" : "service";
  const verb = chip.running ? "Stop" : "Start";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${verb} ${chip.name} ${noun} in ${projectLabel}`}
      title={`${verb} the ${chip.name} ${noun}`}
      className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
        chip.running
          ? "bg-[color-mix(in_srgb,var(--accent-green)_16%,transparent)] text-[var(--accent-green-text)] hover:bg-[color-mix(in_srgb,var(--accent-green)_26%,transparent)]"
          : "bg-[var(--bg-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span className="grid h-3 w-3 shrink-0 place-items-center opacity-70 [&>svg]:h-2.5 [&>svg]:w-2.5">
        {chip.running ? <StopIcon /> : <PlayIcon />}
      </span>
      <span className={chip.kind === "service" ? "font-mono" : undefined}>
        {chip.name}
      </span>
    </button>
  );
}
