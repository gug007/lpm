import { memo } from "react";
import { BranchIcon, TerminalIcon, TrashIcon } from "../icons";
import { PlayIcon } from "./icons";
import { providerMeta } from "../../agentStatus";
import { relativeTime } from "../../relativeTime";
import type { SessionRow as Row } from "../../agentSessions";

interface ResumeSessionRowProps {
  row: Row;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
  onForget?: () => void;
}

// One conversation. The whole row is the button — hovering or arrowing onto it
// previews what pressing it does, and the trailing controls only appear there.
export const ResumeSessionRow = memo(function ResumeSessionRow({
  row,
  active,
  onHover,
  onPick,
  onForget,
}: ResumeSessionRowProps) {
  const meta = providerMeta(row.provider ?? "unknown");
  const open = row.openInTerminalId !== undefined;

  return (
    <div
      onMouseMove={onHover}
      className={`group relative flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors ${
        active ? "bg-[var(--bg-hover)]" : ""
      }`}
    >
      <button
        type="button"
        onClick={onPick}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md [&>svg]:h-3.5 [&>svg]:w-3.5"
          style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}
        >
          <TerminalIcon />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">
              {row.title}
            </span>
            {open && (
              <span className="shrink-0 rounded bg-[var(--accent-green)]/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--accent-green)]">
                Open
              </span>
            )}
          </span>
          {row.preview && row.preview !== row.title && (
            <span className="truncate text-[11px] leading-snug text-[var(--text-muted)]">
              {row.preview}
            </span>
          )}
        </span>

        <span className="flex shrink-0 items-center gap-2.5 text-[10px] text-[var(--text-muted)]">
          <span className="text-[var(--text-secondary)]">{meta.short}</span>
          {row.gitBranch && (
            <span className="flex max-w-[110px] items-center gap-1 truncate">
              <BranchIcon size={10} />
              <span className="truncate">{row.gitBranch}</span>
            </span>
          )}
          <span className="w-8 text-right tabular-nums">
            {relativeTime(Math.floor(row.updatedAt / 1000))}
          </span>
        </span>
      </button>

      <div
        className={`flex shrink-0 items-center gap-0.5 transition-opacity ${
          active ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={onPick}
          aria-label={open ? "Go to tab" : "Resume"}
          title={open ? "Go to tab" : "Resume"}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] [&>svg]:h-3 [&>svg]:w-3"
        >
          <PlayIcon />
        </button>
        {onForget && (
          <button
            type="button"
            onClick={onForget}
            aria-label="Remove from list"
            title="Remove from list"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--accent-red)]/10 hover:text-[var(--accent-red)]"
          >
            <TrashIcon size={12} />
          </button>
        )}
      </div>
    </div>
  );
});
