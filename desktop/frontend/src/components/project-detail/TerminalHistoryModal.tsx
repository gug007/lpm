import { Modal } from "../ui/Modal";
import { TerminalIcon, TrashIcon } from "../icons";
import { PlayIcon } from "./icons";
import { relativeTime } from "../../relativeTime";
import type { PersistedHistoryEntry } from "../../terminals";

interface TerminalHistoryModalProps {
  entries: PersistedHistoryEntry[];
  onResume: (entry: PersistedHistoryEntry) => void;
  onForget: (entry: PersistedHistoryEntry) => void;
  onClose: () => void;
}

export function TerminalHistoryModal({
  entries,
  onResume,
  onForget,
  onClose,
}: TerminalHistoryModalProps) {
  return (
    <Modal
      open
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="w-[28rem] max-h-[70vh] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl flex flex-col"
    >
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Resume session
        </h3>
        <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
          Reopen a closed terminal that supports session resume.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="flex-1 px-5 py-10 text-center text-[13px] text-[var(--text-muted)]">
          No sessions yet. Closed sessions that support resume will appear here.
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto border-t border-[var(--border)]">
          {entries.map((entry) => (
            <HistoryRow
              key={entry.resumeCmd}
              entry={entry}
              onResume={() => onResume(entry)}
              onForget={() => onForget(entry)}
            />
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

interface HistoryRowProps {
  entry: PersistedHistoryEntry;
  onResume: () => void;
  onForget: () => void;
}

function HistoryRow({ entry, onResume, onForget }: HistoryRowProps) {
  const subtitle = entry.actionName ?? entry.startCmd ?? entry.resumeCmd;
  return (
    <li className="group flex items-center gap-3 border-b border-[var(--border)] px-5 py-3 last:border-b-0 hover:bg-[var(--bg-hover)]">
      <button
        type="button"
        onClick={onResume}
        className="flex flex-1 items-center gap-3 text-left"
        title="Resume session"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--bg-active)] text-[var(--text-secondary)]">
          <TerminalIcon />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">
            {entry.label}
          </span>
          <span className="truncate font-mono text-[11px] text-[var(--text-muted)]">
            {subtitle}
          </span>
        </span>
        <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
          {relativeTime(Math.floor(entry.closedAt / 1000))}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onResume}
          aria-label="Resume"
          title="Resume"
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]"
        >
          <PlayIcon />
        </button>
        <button
          type="button"
          onClick={onForget}
          aria-label="Remove from history"
          title="Remove"
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] opacity-0 transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--accent-red)] group-hover:opacity-100"
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}
