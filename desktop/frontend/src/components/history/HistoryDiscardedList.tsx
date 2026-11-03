import { useState } from "react";
import { restoreDiscarded, type DiscardedCopy } from "../../gitDiscardUndo";
import { relativeAgo } from "../../relativeTime";
import { UndoIcon } from "../icons";

interface HistoryDiscardedListProps {
  projectPath: string;
  copies: DiscardedCopy[];
  onRestored: () => void;
}

const NAMES_SHOWN = 3;

function filesText(files: string[]): string {
  const names = files.slice(0, NAMES_SHOWN).map((f) => f.split("/").pop() ?? f);
  const more = files.length - names.length;
  return more > 0 ? `${names.join(", ")} +${more}` : names.join(", ");
}

/** Discards kept for a week, above the commits, each one restorable. */
export function HistoryDiscardedList({ projectPath, copies, onRestored }: HistoryDiscardedListProps) {
  const [restoring, setRestoring] = useState<string | null>(null);
  if (copies.length === 0) return null;

  const restore = async (id: string) => {
    setRestoring(id);
    await restoreDiscarded(projectPath, id, onRestored);
    setRestoring(null);
  };

  return (
    <section aria-label="Discarded changes" className="mb-2 border-b border-[var(--border)] pb-2">
      <h3 className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        Discarded · kept 7 days
      </h3>
      <ul>
        {copies.map((copy) => (
          <li
            key={copy.id}
            className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--bg-hover)]"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[12.5px] text-[var(--text-primary)]">
                {copy.files.length} file{copy.files.length !== 1 ? "s" : ""}
                <span className="ml-2 text-[11px] text-[var(--text-muted)]">{relativeAgo(Math.floor(copy.at / 1000))}</span>
              </span>
              <span className="truncate font-mono text-[11px] text-[var(--text-muted)]" title={copy.files.join("\n")}>
                {filesText(copy.files)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void restore(copy.id)}
              disabled={restoring !== null}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)] disabled:opacity-50"
            >
              <UndoIcon />
              {restoring === copy.id ? "Restoring…" : "Restore"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
