import { useState } from "react";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { remoteGitPush, remoteGitPull } from "./review/remoteReviewSource";
import { GitCommitIcon, ChevronDownIcon } from "./icons";
import { toast } from "../toast";

// The footer Commit control — byte-identical to the local commit split-button
// (BranchSwitcher's), with remote-wired actions: the primary half opens the
// remote review/commit pane; the caret menu offers Pull/Push (the local menu's
// items that have wired remote twins — create-PR/CommitModal-only flows omitted,
// no dead entries).
export function RemoteCommitButton({
  peerId,
  project,
  changed,
  onOpen,
  onDone,
}: {
  peerId: string;
  project: string;
  changed: number;
  onOpen: () => void;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  const run = async (label: string, op: () => Promise<void>) => {
    setBusy(true);
    try {
      await op();
      onDone();
      toast.success(`${label} done`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <div
      ref={ref}
      className="relative flex rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]"
    >
      <button
        onClick={onOpen}
        disabled={busy}
        title={changed > 0 ? "Commit changes" : "No changes to commit"}
        className="flex items-center gap-1 rounded-l-md px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        <GitCommitIcon size={12} />
        <span>Commit</span>
        {changed > 0 && (
          <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-blue)]" />
        )}
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-label="More git options"
        className={`flex items-center rounded-r-md border-l border-[var(--border)] px-2 py-1 transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 ${
          open
            ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)]"
        }`}
      >
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-10 mb-2 w-44 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-xl">
          <button
            onClick={() =>
              void run("Pull", () => remoteGitPull(peerId, project))
            }
            disabled={busy}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            Pull
          </button>
          <button
            onClick={() =>
              void run("Push", () => remoteGitPush(peerId, project))
            }
            disabled={busy}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            Push
          </button>
        </div>
      )}
    </div>
  );
}
