import { useState } from "react";
import { useOutsideClick } from "../hooks/useOutsideClick";
import {
  remoteGitPush,
  remoteGitPull,
  remoteGitFetch,
} from "./review/remoteReviewSource";
import {
  GitCommitIcon,
  ChevronDownIcon,
  DownloadIcon,
  UploadIcon,
  RefreshIcon,
  PRIcon,
  UndoIcon,
} from "./icons";
import { toast } from "../toast";

// The footer Commit control — the primary half opens the remote review/commit
// pane; the caret menu mirrors the local git submenu (Pull / Push / Fetch, then
// Create PR, then Discard all). Pull/Push/Fetch run inline (async peer replies);
// Create PR and Discard all defer to the parent, which hosts the PR modal and
// the discard confirm (WKWebView has no native confirm).
export function RemoteCommitButton({
  peerId,
  project,
  changed,
  onOpen,
  onDone,
  onCreatePr,
  onDiscardAll,
}: {
  peerId: string;
  project: string;
  changed: number;
  onOpen: () => void;
  onDone: () => void;
  onCreatePr: () => void;
  onDiscardAll: () => void;
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

  const defer = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const itemClass =
    "flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40";

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
        <div className="absolute bottom-full right-0 z-10 mb-2 w-52 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-xl">
          <button
            onClick={() => void run("Pull", () => remoteGitPull(peerId, project))}
            disabled={busy}
            className={itemClass}
          >
            <DownloadIcon />
            Pull
          </button>
          <button
            onClick={() => void run("Push", () => remoteGitPush(peerId, project))}
            disabled={busy}
            className={itemClass}
          >
            <UploadIcon />
            Push
          </button>
          <button
            onClick={() =>
              void run("Fetch", () => remoteGitFetch(peerId, project))
            }
            disabled={busy}
            className={itemClass}
          >
            <RefreshIcon />
            Fetch
          </button>
          <div className="my-1 border-t border-[var(--border)]" />
          <button
            onClick={defer(onCreatePr)}
            disabled={busy}
            className={itemClass}
          >
            <PRIcon />
            Create PR…
          </button>
          <div className="my-1 border-t border-[var(--border)]" />
          <button
            onClick={defer(onDiscardAll)}
            disabled={busy || changed === 0}
            title={changed === 0 ? "No changes to discard" : undefined}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--accent-red)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
          >
            <UndoIcon />
            Discard all changes…
          </button>
        </div>
      )}
    </div>
  );
}
