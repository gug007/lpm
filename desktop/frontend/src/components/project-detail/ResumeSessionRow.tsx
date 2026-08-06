import { memo } from "react";
import { BranchIcon, TrashIcon } from "../icons";
import { providerMeta } from "../../agentStatus";
import { relativeTime, shortStamp } from "../../relativeTime";
import { echoesTitle } from "../../sessionText";
import type { SessionRow } from "../../agentSessions";

interface ResumeSessionRowProps {
  row: SessionRow;
  active: boolean;
  domId: string;
  onHover: (key: string) => void;
  onPick: (row: SessionRow) => void;
  onForget?: (row: SessionRow) => void;
}

// The opening prompt, unless it only restates the title — agents name a session
// after its first prompt, so the two are often the same words. Then the exact
// time takes the slot: it's what tells two runs of one prompt apart.
function detailOf(row: SessionRow): string {
  return row.titleOrigin === "named" && !echoesTitle(row.title, row.preview)
    ? row.preview
    : shortStamp(row.updatedAt);
}

// One conversation. The whole row is the button; the age gives up its slot to
// the remove control on hover, so nothing shifts and no text sits underneath.
export const ResumeSessionRow = memo(function ResumeSessionRow({
  row,
  active,
  domId,
  onHover,
  onPick,
  onForget,
}: ResumeSessionRowProps) {
  const meta = providerMeta(row.provider ?? "unknown");
  const openInTab = row.openInTerminalId !== undefined;
  const detail = detailOf(row);
  const dated = row.updatedAt > 0;

  return (
    <div
      id={domId}
      role="option"
      aria-selected={active}
      onMouseEnter={() => onHover(row.key)}
      className={`group relative flex scroll-mt-8 items-center gap-3 rounded-lg px-2.5 py-2 transition-colors ${
        active
          ? "bg-[var(--bg-active)] ring-1 ring-inset ring-[var(--accent-blue)]"
          : "hover:bg-[var(--bg-hover)]"
      }`}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={() => onPick(row)}
        className="min-w-0 flex-1 text-left focus-visible:outline-none"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            title={row.title}
            className="min-w-0 truncate text-[13px] font-medium text-[var(--text-primary)]"
          >
            {row.title}
          </span>
          {openInTab && (
            <span className="shrink-0 rounded bg-[var(--accent-green)]/15 px-1.5 py-px text-[10px] text-[var(--accent-green)]">
              In a tab
            </span>
          )}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] leading-snug text-[var(--text-muted)]">
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
          <span className="shrink-0 text-[var(--text-secondary)]">{meta.short}</span>
          {row.gitBranch && (
            <span className="flex min-w-0 max-w-[45%] items-center gap-1">
              <span aria-hidden>·</span>
              <span className="shrink-0">
                <BranchIcon size={10} />
              </span>
              <span className="truncate">{row.gitBranch}</span>
            </span>
          )}
          {detail && (
            <span title={detail} className="min-w-0 truncate">
              · {detail}
            </span>
          )}
        </span>
      </button>

      <time
        dateTime={dated ? new Date(row.updatedAt).toISOString() : undefined}
        className={`w-9 shrink-0 text-right text-[10px] tabular-nums text-[var(--text-muted)] transition-opacity ${
          onForget ? (active ? "opacity-0" : "group-hover:opacity-0") : ""
        }`}
      >
        {dated ? relativeTime(Math.floor(row.updatedAt / 1000)) : "—"}
      </time>

      {onForget && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onForget(row)}
          aria-label={`Remove ${row.title} from this list`}
          title="Remove from list"
          className={`absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--accent-red)]/10 hover:text-[var(--accent-red)] group-hover:pointer-events-auto group-hover:opacity-100 ${
            active ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <TrashIcon size={12} />
        </button>
      )}
    </div>
  );
});
