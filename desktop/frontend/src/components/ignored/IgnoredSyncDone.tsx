import { CircleCheck, RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";
import { formatBytes } from "../../syncApi";
import type { SyncDone } from "./ignoredSyncApi";
import { countOf, listNames } from "./syncWords";

interface IgnoredSyncDoneProps {
  done: SyncDone;
  paths: string[];
  here: string;
  // The computers synced with.
  peers: string[];
  undoing: boolean;
  onUndo: () => void;
  onDone: () => void;
}

/// What this sync brought over, to each computer.
function movedNow(done: SyncDone, here: string, peers: string[]): string {
  if (done.unchanged) return `${peers.length > 1 ? "Every computer" : "Both computers"} already had the same files.`;
  const sentTo = done.sentTo ?? [{ machine: peers[0], files: done.sent ?? 0 }];
  const parts = [
    done.received ? `${countOf(done.received, "file")} to ${here}` : "",
    ...sentTo.map((s) => (s.files ? `${countOf(s.files, "file")} to ${s.machine}` : "")),
    formatBytes(done.bytes ?? 0),
  ];
  return `Brought in step now: ${parts.filter(Boolean).join(" · ")}`;
}

export function IgnoredSyncDone({ done, paths, here, peers, undoing, onUndo, onDone }: IgnoredSyncDoneProps) {
  const several = peers.length > 1;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-3.5 overflow-auto border-t border-[var(--border)] px-12 py-9">
      {done.ok ? (
        <CircleCheck size={38} strokeWidth={1.75} className="text-[var(--accent-green-text)]" />
      ) : (
        <TriangleAlert size={38} strokeWidth={1.75} className="text-[var(--accent-amber-text)]" />
      )}
      <div className="text-[16px] font-semibold text-[var(--text-primary)]">
        {done.ok ? "In sync with" : "Partly in sync with"} {listNames(peers)}
      </div>
      <div className="text-center text-[12.5px] text-[var(--text-secondary)]">{movedNow(done, here, peers)}</div>
      {!done.ok && done.error && (
        <div className="max-w-[560px] text-center text-[12.5px] text-[var(--accent-amber-text)]">
          Stopped part way: {done.error}. It tries again while the computers are connected.
        </div>
      )}
      <div className="w-full max-w-[560px] shrink-0 overflow-hidden rounded-xl border border-[var(--border)]">
        {paths.map((p) => (
          <div key={p} className="flex items-center gap-2.5 border-t border-[var(--border)] px-3.5 py-2 text-[12px] first:border-t-0">
            <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-primary)]">{p}</span>
            <span className="text-[var(--text-muted)]">{p.endsWith("/") ? "whole folder" : "file"}</span>
          </div>
        ))}
      </div>
      <div className="flex w-full max-w-[560px] items-start gap-2.5 rounded-[10px] border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/7 px-3 py-2.5 text-[12px] leading-snug text-[var(--accent-cyan-text)]">
        <RefreshCw size={15} className="mt-px shrink-0" />
        <span>
          {several
            ? `From now on, changes copy over between all ${peers.length + 1} computers while they're connected, and new files in a ticked folder come too. ${here} passes changes between the others, so they sync while it's on. A file changed on two computers asks before anything is replaced.`
            : "From now on, changes copy over both ways while both computers are connected, and new files in a ticked folder come too. A file changed on both computers asks before anything is replaced."}
        </span>
      </div>
      <div className="mt-1.5 flex gap-2">
        {!!done.batches?.length && (
          <button
            type="button"
            onClick={onUndo}
            disabled={undoing}
            title="Put back what this sync changed, and pause syncing"
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3.5 py-2 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
          >
            <RotateCcw size={14} />
            {undoing ? "Undoing…" : "Undo"}
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg bg-[var(--text-primary)] px-[18px] py-2 text-[13px] font-semibold text-[var(--bg-primary)] hover:opacity-90"
        >
          Done
        </button>
      </div>
    </div>
  );
}
