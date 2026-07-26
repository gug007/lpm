import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FolderSync, X } from "lucide-react";
import { Modal } from "./ui/Modal";
import { ProgressBar } from "./ui/ProgressBar";
import { HELPER_TEXT } from "./ui/fields";
import { SpinnerIcon } from "./project-detail/icons";
import {
  formatBytes,
  syncProjectCancel,
  syncProjectStart,
  type SyncDone,
  type SyncPhase,
  type SyncProgress,
} from "../syncApi";
import { EventsOn } from "../../bridge/runtime";

const PHASE_LABEL: Record<SyncPhase, string> = {
  creating: "Making the folder",
  preparing: "Preparing on the other Mac",
  transferring: "Copying the project over",
  indexing: "Reading it in",
  applying: "Putting the files in place",
  seeding: "Bringing dependencies across",
};

interface SyncSetupModalProps {
  // The project as it is named on the other Mac, and where it lives there.
  remoteName: string;
  sourceRoot: string;
  slug: string;
  macName: string;
  onClose: () => void;
}

// Shown while a folder is being set up for the first time. Everything after this
// is the follow scheduler's job and needs no window of its own.
export function SyncSetupModal({
  remoteName,
  sourceRoot,
  slug,
  macName,
  onClose,
}: SyncSetupModalProps) {
  const [run, setRun] = useState<SyncProgress | null>(null);
  const [error, setError] = useState("");
  const idRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const doneRef = useRef<(done: SyncDone) => void>(() => {});

  doneRef.current = (done: SyncDone) => {
    if (done.ok) {
      toast.success(
        `Syncing ${done.project ?? remoteName} from ${macName}${
          done.branch ? ` on ${done.branch}` : ""
        }`,
        { description: seedDescription(done) },
      );
      onClose();
      return;
    }
    if (!done.error || cancelledRef.current) {
      onClose();
      return;
    }
    setError(done.error);
    setRun(null);
  };

  // Subscribed once, before the run starts: re-subscribing per render would leave
  // a gap where a frame lands between listeners (listen() resolves async).
  useEffect(() => {
    const offProgress = EventsOn("sync-progress", (p: SyncProgress) => {
      if (p?.id && p.id === idRef.current) setRun(p);
    });
    const offDone = EventsOn("sync-done", (done: SyncDone) => {
      if (!done?.id || done.id !== idRef.current) return;
      idRef.current = null;
      doneRef.current(done);
    });
    return () => {
      offProgress();
      offDone();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setRun({ id: "", phase: "creating", received: 0, total: 0 });
    syncProjectStart(slug, sourceRoot, remoteName).then(
      (id) => {
        if (!alive) return;
        idRef.current = id;
        // Cancelling before the id arrived still has to take effect.
        if (cancelledRef.current) void syncProjectCancel(id);
      },
      (err) => {
        if (!alive) return;
        setError(String(err));
        setRun(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [slug, sourceRoot, remoteName]);

  const requestClose = () => {
    if (!run) {
      onClose();
      return;
    }
    cancelledRef.current = true;
    if (idRef.current) void syncProjectCancel(idRef.current);
  };

  const percent =
    run && run.total > 0
      ? Math.min(100, Math.round((run.received / run.total) * 100))
      : 0;

  return (
    <Modal
      open
      onClose={requestClose}
      backdrop={false}
      draggable
      zIndexClassName="z-[60]"
      contentClassName="flex w-[min(460px,92vw)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div
        data-modal-drag-handle
        className="flex shrink-0 items-start gap-3 px-6 pb-1 pt-6"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] ring-1 ring-inset ring-[var(--accent-cyan)]/20">
          <FolderSync size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
            Sync to this Mac
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
            <span className="font-mono text-[var(--text-secondary)]">{remoteName}</span> from{" "}
            <span className="text-[var(--text-secondary)]">{macName}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className="-mr-1 -mt-1 ml-auto shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-6 pb-6 pt-5">
        {run ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
              <SpinnerIcon />
              {PHASE_LABEL[run.phase]}
            </div>
            {run.total > 0 && <ProgressBar value={percent} />}
            <p className={HELPER_TEXT}>
              {run.total > 0
                ? `${formatBytes(run.received)} of ${formatBytes(run.total)}`
                : "The first sync carries the whole project, so this can take a while."}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 px-3 py-2 text-[12px] leading-snug text-[var(--accent-red)]">
            {error || "Couldn't set the folder up"}
          </div>
        )}
      </div>

      <div className="flex shrink-0 justify-end border-t border-[var(--border)] px-6 pb-6 pt-4">
        <button
          type="button"
          onClick={requestClose}
          className="rounded-lg px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          {run ? "Cancel" : "Close"}
        </button>
      </div>
    </Modal>
  );
}

// Dependencies and configuration never travel over git, so a first sync takes them
// from a local project of the same name when there is one. Always said out loud:
// files appearing from another folder should never be a silent surprise.
function seedDescription(done: SyncDone): string | undefined {
  if (!done.twin) {
    return "Ignored files like node_modules didn't travel — install them before running it.";
  }
  const count = done.seeded ?? 0;
  const what = count === 1 ? "1 ignored item" : `${count} ignored items`;
  return count > 0
    ? `Took ${what} and its configuration from ${done.twin}.`
    : `Configuration comes from ${done.twin}.`;
}
