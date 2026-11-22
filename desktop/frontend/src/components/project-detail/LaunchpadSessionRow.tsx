import type { SessionRow } from "../../agentSessions";
import { providerMeta } from "../../agentStatus";
import { relativeAgo } from "../../relativeTime";
import { AgentGlyph } from "../terminal/AgentGlyph";

// A recent conversation on an empty project's launchpad; the row resumes it.
export function LaunchpadSessionRow({ row, onResume }: { row: SessionRow; onResume: (row: SessionRow) => void }) {
  const meta = providerMeta(row.provider ?? "unknown");
  return (
    <button
      type="button"
      onClick={() => onResume(row)}
      className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
    >
      {row.provider && row.provider !== "cursor" ? (
        <AgentGlyph agent={row.provider} />
      ) : (
        <span aria-hidden className="grid h-4 w-4 shrink-0 place-items-center">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
        </span>
      )}
      <span title={row.title} className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-primary)]">
        {row.title}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">{relativeAgo(Math.floor(row.updatedAt / 1000))}</span>
      <span className="shrink-0 rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors group-hover:border-[var(--text-muted)] group-hover:text-[var(--text-primary)]">
        Resume
      </span>
    </button>
  );
}
