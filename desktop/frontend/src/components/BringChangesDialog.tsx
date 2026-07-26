import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, CopyPlus, FolderGit2, GitPullRequestArrow, X } from "lucide-react";
import { Modal } from "./ui/Modal";
import { ProgressBar } from "./ui/ProgressBar";
import { CopyMacSelect, type CopyTargetOption } from "./CopyMacSelect";
import { BringModeCards, type BringModeOption } from "./BringModeCards";
import { BringCopyList } from "./BringCopyList";
import { CARD_CLASS, FIELD_CLASS, HELPER_TEXT, SECTION_LABEL } from "./ui/fields";
import { SpinnerIcon } from "./project-detail/icons";
import {
  bringChangesSources,
  bringTargetBlockedReason,
  formatBytes,
} from "./bringChangesSources";
import { displayNameForProjectName } from "./ProjectNameDisplay";
import {
  bringChangesCancel,
  bringChangesStart,
  bringChangesTargets,
  type BringDone,
  type BringMode,
  type BringPhase,
  type BringProgress,
  type BringTarget,
} from "../bringChangesApi";
import { EventsOn } from "../../bridge/runtime";
import { usePeerState } from "../peer/usePeerState";
import { useAppStore } from "../store/app";

const PHASE_LABEL: Record<BringPhase, string> = {
  preparing: "Preparing on the other Mac",
  transferring: "Transferring changes",
  indexing: "Reading the changes in",
  duplicating: "Creating the copy",
  applying: "Applying the changes",
};

interface BringChangesDialogProps {
  // The local project the work lands in.
  projectName: string;
  initialSourceSlug?: string;
  onClose: () => void;
}

export function BringChangesDialog({
  projectName,
  initialSourceSlug,
  onClose,
}: BringChangesDialogProps) {
  const projects = useAppStore((s) => s.projects);
  const { state: peerState } = usePeerState();
  const sources = useMemo(
    () => bringChangesSources(projects, peerState.peers, projectName),
    [projects, peerState.peers, projectName],
  );

  const [sourceSlug, setSourceSlug] = useState(initialSourceSlug ?? "");
  const [mode, setMode] = useState<BringMode>("current");
  const [copyName, setCopyName] = useState("");
  const [label, setLabel] = useState("");
  const [targets, setTargets] = useState<BringTarget[] | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<BringProgress | null>(null);
  const runIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const doneRef = useRef<(done: BringDone) => void>(() => {});
  const earlyDoneRef = useRef(new Map<string, BringDone>());

  const displayName = displayNameForProjectName(projectName, projects);
  const source = sources.find((s) => s.slug === sourceSlug);
  const self = targets?.[0];
  const copies = useMemo(() => targets?.slice(1) ?? [], [targets]);
  const loaded = targets !== null;

  useEffect(() => {
    let alive = true;
    bringChangesTargets(projectName).then(
      (list) => {
        if (alive) setTargets(list);
      },
      (err) => {
        if (!alive) return;
        setTargets([]);
        setError(String(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [projectName]);

  // A Mac can disconnect while the dialog is open, dropping it from `sources`;
  // fall back to one that's still there so a stale slug is never submitted.
  useEffect(() => {
    if (sources.length === 0) return;
    setSourceSlug((prev) =>
      sources.some((s) => s.slug === prev) ? prev : sources[0].slug,
    );
  }, [sources]);

  const options: BringModeOption[] = [
    {
      value: "current",
      title: "This project",
      description: `Land the work in ${displayName} itself`,
      icon: <FolderGit2 size={14} />,
      blockedReason: loaded ? bringTargetBlockedReason(self) : undefined,
    },
    {
      value: "existing",
      title: "An existing copy",
      description: "Land it in one of this project's copies instead",
      icon: <Copy size={14} />,
      blockedReason: loaded && copies.length === 0 ? "No copies yet" : undefined,
    },
    {
      value: "new",
      title: "A new copy",
      description: "Duplicate the project first, then land the work there",
      icon: <CopyPlus size={14} />,
      blockedReason:
        loaded && self && !self.isRepo ? "Not a Git repository" : undefined,
    },
  ];
  const blockedMode = options.find((o) => o.value === mode)?.blockedReason;

  useEffect(() => {
    if (!targets) return;
    setMode((current) => {
      const picked = options.find((o) => o.value === current);
      if (picked && !picked.blockedReason) return current;
      return options.find((o) => !o.blockedReason)?.value ?? current;
    });
  }, [targets]);

  useEffect(() => {
    if (mode !== "existing") return;
    const usable = copies.filter((c) => !bringTargetBlockedReason(c));
    if (usable.length === 0) return;
    setCopyName((prev) =>
      usable.some((c) => c.name === prev) ? prev : usable[0].name,
    );
  }, [mode, copies]);

  doneRef.current = (done: BringDone) => {
    if (done.ok) {
      const where = displayNameForProjectName(done.project ?? projectName, projects);
      toast.success(
        `Brought changes into ${where}${done.branch ? ` on ${done.branch}` : ""}`,
      );
      onClose();
      return;
    }
    if (cancelledRef.current) {
      onClose();
      return;
    }
    setError(done.error || "Couldn't bring the changes over");
  };

  // Subscribed once: re-subscribing on every render would leave a gap where a
  // progress frame lands between the old listener going away and the new one
  // attaching (the runtime's listen() resolves asynchronously).
  useEffect(() => {
    const offProgress = EventsOn("bring-changes-progress", (p: BringProgress) => {
      if (p?.id && p.id === runIdRef.current) setRun(p);
    });
    const offDone = EventsOn("bring-changes-done", (done: BringDone) => {
      if (!done?.id) return;
      if (done.id !== runIdRef.current) {
        // A transfer with nothing to send finishes before the start call's own
        // reply hands us the id; hold the result until it does.
        if (runIdRef.current === null) earlyDoneRef.current.set(done.id, done);
        return;
      }
      runIdRef.current = null;
      setRun(null);
      doneRef.current(done);
    });
    return () => {
      offProgress();
      offDone();
    };
  }, []);

  const start = async () => {
    if (!source) return;
    setError("");
    setStarting(true);
    cancelledRef.current = false;
    earlyDoneRef.current.clear();
    try {
      const id = await bringChangesStart({
        sourceSlug: source.slug,
        sourceRoot: source.root,
        project: projectName,
        mode,
        target: mode === "existing" ? copyName : undefined,
        label: mode === "new" ? label.trim() || undefined : undefined,
      });
      const early = earlyDoneRef.current.get(id);
      earlyDoneRef.current.clear();
      if (early) {
        doneRef.current(early);
        return;
      }
      runIdRef.current = id;
      setRun({ id, phase: "preparing", received: 0, total: 0 });
    } catch (err) {
      setError(String(err));
    } finally {
      setStarting(false);
    }
  };

  // While a transfer is live, closing means cancelling it: the dialog stays up
  // until the backend confirms it stopped.
  const requestClose = () => {
    if (!run) {
      onClose();
      return;
    }
    cancelledRef.current = true;
    void bringChangesCancel(run.id);
  };

  const chosenCopy = copies.find((c) => c.name === copyName);
  const canConfirm =
    Boolean(source) &&
    loaded &&
    !blockedMode &&
    !starting &&
    !run &&
    (mode !== "existing" ||
      (copyName !== "" && !bringTargetBlockedReason(chosenCopy)));

  const macOptions: CopyTargetOption[] = sources.map((s) => ({
    name: s.slug,
    label: s.alias,
  }));
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
      contentClassName="flex max-h-[85vh] w-[min(560px,92vw)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div
        data-modal-drag-handle
        className="flex shrink-0 items-start gap-3 px-6 pb-1 pt-6"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] ring-1 ring-inset ring-[var(--accent-cyan)]/20">
          <GitPullRequestArrow size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
            Bring changes
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
            <span className="font-mono text-[var(--text-secondary)]">
              {displayName}
            </span>{" "}
            from{" "}
            <span className="text-[var(--text-secondary)]">
              {source?.alias ?? "another Mac"}
            </span>
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

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-6 pt-5">
        {run ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
              <SpinnerIcon />
              {PHASE_LABEL[run.phase]}
            </div>
            {run.total > 0 && <ProgressBar value={percent} />}
            <p className={HELPER_TEXT}>
              {run.total > 0
                ? `${formatBytes(run.received)} of ${formatBytes(run.total)}`
                : run.message || "This can take a moment on a large project."}
            </p>
          </div>
        ) : (
          <>
            {sources.length > 1 && (
              <div className={`${CARD_CLASS} flex items-center justify-between gap-3 px-4 py-3`}>
                <span className={SECTION_LABEL}>From</span>
                <CopyMacSelect
                  options={macOptions}
                  value={sourceSlug}
                  onChange={setSourceSlug}
                  title="Which Mac the changes come from"
                />
              </div>
            )}

            <BringModeCards options={options} value={mode} onChange={setMode} />

            {mode === "existing" && copies.length > 0 && (
              <div className="field-reveal">
                <BringCopyList
                  copies={copies}
                  value={copyName}
                  onChange={setCopyName}
                />
              </div>
            )}

            {mode === "new" && (
              <div className="field-reveal">
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder="Label for the new copy (optional)"
                  className={`${FIELD_CLASS} h-9 px-3`}
                />
              </div>
            )}

            <p className={HELPER_TEXT}>
              {source?.alias ?? "The other Mac"}'s committed and uncommitted work
              lands on a new branch. Nothing is pushed, and the branch you're on
              now stays where it is.
            </p>

            {sources.length === 0 && (
              <p className="text-[12px] leading-snug text-[var(--accent-amber)]">
                No connected Mac has this project right now.
              </p>
            )}

            {error && (
              <div className="rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 px-3 py-2 text-[12px] leading-snug text-[var(--accent-red)]">
                {error}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-6 pb-6 pt-4">
        <button
          type="button"
          onClick={requestClose}
          className="rounded-lg px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={start}
          disabled={!canConfirm}
          className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-[13px] font-medium text-[var(--bg-primary)] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {run ? "Bringing changes…" : "Bring changes"}
        </button>
      </div>
    </Modal>
  );
}
