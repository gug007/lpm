import { ArrowUpRight, Crosshair } from "lucide-react";
import { formatPercent } from "../../agentUsageFormat";
import { ChangeValue } from "./ChangeValue";
import { formatUsd } from "./statsCost";
import type { ProjectPanelRow } from "./projectsPanelRows";
import { Sparkline } from "./Sparkline";

const ACTION =
  "flex h-6 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 text-[11px] font-medium text-[var(--text-secondary)] transition-colors duration-[120ms] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]";

interface ProjectRowProps {
  row: ProjectPanelRow;
  name: string;
  focused: boolean;
  canOpen: boolean;
  showSpark: boolean;
  showCost: boolean;
  showChange: boolean;
  reducedMotion: boolean;
  onFocus: () => void;
  onOpen: () => void;
}

export function ProjectRow({
  row,
  name,
  focused,
  canOpen,
  showSpark,
  showCost,
  showChange,
  reducedMotion,
  onFocus,
  onOpen,
}: ProjectRowProps) {
  return (
    <div
      className={`group flex min-h-9 items-center gap-3 px-4 py-1.5 text-[12px] transition-colors duration-[120ms] ${
        focused ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
      }`}
    >
      <span
        className="min-w-0 flex-1 truncate font-medium"
        title={`${name} · ${row.sessions} session${row.sessions === 1 ? "" : "s"}`}
      >
        {name}
      </span>
      {showSpark && (
        <span className="w-16 shrink-0">
          <Sparkline data={row.spark} height={16} />
        </span>
      )}
      <span className="relative flex w-[104px] shrink-0 items-center">
        <span className="flex flex-1 items-center gap-1.5 group-focus-within:invisible group-hover:invisible">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-active)]">
            <span
              className="block h-full rounded-full bg-[var(--text-secondary)]"
              style={{
                width: `${row.share * 100}%`,
                opacity: focused ? 1 : 0.55,
                transition: reducedMotion ? "none" : "width 240ms ease-out",
              }}
            />
          </span>
          <span className="w-8 text-right tabular-nums text-[var(--text-secondary)]">
            {formatPercent(row.share)}
          </span>
        </span>
        <span className="absolute inset-0 flex items-center justify-end gap-1 opacity-0 transition-opacity duration-[120ms] group-focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" onClick={onFocus} aria-pressed={focused} className={ACTION}>
            <Crosshair size={11} />
            {focused ? "Unfocus" : "Focus"}
          </button>
          {canOpen && (
            <button type="button" onClick={onOpen} aria-label={`Open ${name}`} className={ACTION}>
              <ArrowUpRight size={12} />
            </button>
          )}
        </span>
      </span>
      {showCost && (
        <span className="w-14 shrink-0 text-right font-medium tabular-nums">
          {row.cost === null ? "—" : formatUsd(row.cost)}
        </span>
      )}
      {showChange && (
        <span className="flex w-14 shrink-0 justify-end">
          <ChangeValue change={row.change} />
        </span>
      )}
    </div>
  );
}
