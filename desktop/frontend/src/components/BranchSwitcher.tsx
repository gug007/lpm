import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckoutBranch,
  CreateBranch,
  GitDiscardAll,
  PullBranch,
  SyncBranch,
} from "../../wailsjs/go/main/App";
import { getSettings, saveSettings, DEFAULT_PULL_STRATEGY, type GitPullStrategy } from "../settings";
import { main } from "../../wailsjs/go/models";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { useEventListener } from "../hooks/useEventListener";
import { useGitStatus } from "../hooks/useGitStatus";
import { useBranchSearch } from "../hooks/useBranchSearch";
import { CreateBranchModal } from "./CreateBranchModal";
import { CommitModal } from "./CommitModal";
import { PRModal } from "./PRModal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { BranchIcon, ChevronLeftIcon, CloudBranchIcon, UndoIcon } from "./icons";
import { branchKey, branchMatches, RemoteBadge } from "./branchUtils";

const PULL_STRATEGIES: { value: GitPullStrategy; label: string }[] = [
  { value: "ff-only", label: "Pull" },
  { value: "rebase", label: "Pull (Rebase)" },
];

function relativeTime(unix: number): string {
  if (!unix) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unix);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  if (s < 2592000) return `${Math.floor(s / 604800)}w`;
  if (s < 31536000) return `${Math.floor(s / 2592000)}mo`;
  return `${Math.floor(s / 31536000)}y`;
}

export function BranchSwitcher({ projectPath }: {
  projectPath: string;
}) {
  const { status, branches, refresh } = useGitStatus(projectPath);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchResults = useBranchSearch(projectPath, query, open);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [creatingPR, setCreatingPR] = useState(false);
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  const [pullMenuOpen, setPullMenuOpen] = useState(false);
  const [confirmDiscardAllOpen, setConfirmDiscardAllOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const pullCloseTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (pullCloseTimer.current) window.clearTimeout(pullCloseTimer.current);
  }, []);

  const openPullMenu = () => {
    if (pullCloseTimer.current) {
      window.clearTimeout(pullCloseTimer.current);
      pullCloseTimer.current = null;
    }
    setPullMenuOpen(true);
  };

  const schedulePullClose = () => {
    if (pullCloseTimer.current) window.clearTimeout(pullCloseTimer.current);
    pullCloseTimer.current = window.setTimeout(() => setPullMenuOpen(false), 120);
  };
  const commitMenuRef = useOutsideClick<HTMLDivElement>(
    () => setCommitMenuOpen(false),
    commitMenuOpen,
  );

  const ref = useOutsideClick<HTMLDivElement>(() => {
    setOpen(false);
  }, open && !creating);

  useEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") setOpen(false);
    },
    document,
    open && !creating,
  );

  useEffect(() => {
    if (open && !creating) searchRef.current?.focus();
  }, [open, creating]);

  const current = status?.branch ?? "";
  const filtered = useMemo(() => {
    const base = !query
      ? branches
      : searchResults !== null
        ? searchResults
        // Fallback during the debounce window: filter the cached recent list.
        : branches.filter((b) => branchMatches(b, query));
    const rank = (b: main.Branch) =>
      b.name === current && !b.remote ? 0 : b.remote ? 2 : 1;
    // Relies on Array.prototype.sort being stable, so committer-date order
    // from the backend is preserved within each rank group.
    return [...base].sort((a, b) => rank(a) - rank(b));
  }, [branches, query, searchResults, current]);

  if (!status?.isGitRepo) return null;

  const checkout = async (branch: main.Branch) => {
    if (busy || branch.name === status.branch) { setOpen(false); return; }
    setBusy(true);
    try {
      await CheckoutBranch(projectPath, branch.name, branch.remote ?? "");
      await refresh();
      setOpen(false);
      setQuery("");
    } catch (err) {
      toast.error(`Checkout ${branch.name}: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const create = async (name: string) => {
    if (!name || busy) return;
    setBusy(true);
    try {
      await CreateBranch(projectPath, name);
      await refresh();
      setOpen(false);
      setCreating(false);
      setQuery("");
    } catch (err) {
      toast.error(`Create ${name}: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const toggleOpen = () => {
    if (!open) refresh();
    setOpen(!open);
  };

  const sync = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await SyncBranch(projectPath);
      await refresh();
    } catch (err) {
      toast.error(`Sync: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const pull = async (strategy: GitPullStrategy) => {
    if (busy) return;
    setCommitMenuOpen(false);
    setPullMenuOpen(false);
    if (strategy !== (getSettings().gitPullStrategy ?? DEFAULT_PULL_STRATEGY)) {
      void saveSettings({ gitPullStrategy: strategy });
    }
    setBusy(true);
    try {
      await PullBranch(projectPath, strategy);
      await refresh();
    } catch (err) {
      toast.error(`Pull: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardAll = async () => {
    setDiscarding(true);
    try {
      await GitDiscardAll(projectPath);
      toast.success("Discarded all changes");
      refresh();
    } catch (err) {
      toast.error(`Discard failed: ${err}`);
    } finally {
      setDiscarding(false);
      setConfirmDiscardAllOpen(false);
    }
  };

  const needsSync = status.hasUpstream && (status.ahead > 0 || status.behind > 0);

  return (
    <div className="flex items-center gap-1.5">
      {needsSync && (
        <button
          onClick={sync}
          disabled={busy}
          title={busy ? "Syncing…" : `Pull ${status.behind}, push ${status.ahead}`}
          className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <SyncIcon spinning={busy} />
          {status.behind > 0 && <span>{status.behind}↓</span>}
          {status.ahead > 0 && <span>{status.ahead}↑</span>}
        </button>
      )}
      <div ref={ref} className="relative">
        <button
          onClick={toggleOpen}
          title={busy ? "Switching branch…" : "Switch branch"}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <BranchIcon size={12} />
          <span className="max-w-32 truncate">{status.branch || "detached"}</span>
          {status.uncommitted > 0 && (
            <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" title={`${status.uncommitted} uncommitted file${status.uncommitted === 1 ? "" : "s"}`} />
          )}
          <ChevronDown />
        </button>

      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-1 w-96 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg">
          <div className="border-b border-[var(--border)] p-2">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search branches"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full rounded-md bg-[var(--bg-hover)] px-2 py-1 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </div>
          <div className="max-h-[250px] overflow-y-auto py-1">
            <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Branches
            </div>
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-[var(--text-muted)]">No matches</div>
            )}
            {filtered.map((b) => {
              const isCurrent = b.name === status.branch;
              const age = relativeTime(b.committerDate);
              return (
                <button
                  key={branchKey(b)}
                  onClick={() => checkout(b)}
                  disabled={busy}
                  title={b.remote ? `Create local tracking branch from ${b.remote}/${b.name}` : undefined}
                  className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
                >
                  {b.remote ? <CloudBranchIcon size={12} /> : <BranchIcon size={12} />}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`flex min-w-0 items-center gap-1.5 ${isCurrent ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                      <span className="truncate">{b.name}</span>
                      {b.remote && <RemoteBadge remote={b.remote} />}
                    </span>
                    {isCurrent && status.uncommitted > 0 && (
                      <span className="text-[10px] text-[var(--text-muted)]">
                        Uncommitted: {status.uncommitted} file{status.uncommitted === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                  {age && <span className="shrink-0 self-center text-[10px] text-[var(--text-muted)]">{age}</span>}
                  {isCurrent && <CheckIcon />}
                </button>
              );
            })}
          </div>
          <div className="border-t border-[var(--border)]">
            <button
              onClick={() => setCreating(true)}
              disabled={busy}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
            >
              <PlusIcon />
              <span>Create and checkout new branch…</span>
            </button>
          </div>
        </div>
      )}
      </div>
      <div ref={commitMenuRef} className="relative flex">
        <button
          onClick={() => setCommitting(true)}
          disabled={busy || status.uncommitted === 0}
          title={status.uncommitted > 0 ? "Commit changes" : "No changes to commit"}
          className="flex items-center gap-1 rounded-l-md border border-r-0 border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <CommitIcon />
          <span>Commit</span>
          {status.uncommitted > 0 && (
            <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-blue)]" />
          )}
        </button>
        <button
          onClick={() => setCommitMenuOpen(!commitMenuOpen)}
          disabled={busy}
          className="flex items-center rounded-r-md border border-[var(--border)] bg-[var(--bg-primary)] px-1 py-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <ChevronDown />
        </button>
        {commitMenuOpen && (
          <div className="absolute bottom-full right-0 z-10 mb-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg">
            <button
              onClick={() => { setCommitMenuOpen(false); setCommitting(true); }}
              disabled={status.uncommitted === 0}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              <CommitIcon />
              Commit
            </button>
            <PullMenu
              busy={busy}
              currentStrategy={getSettings().gitPullStrategy ?? DEFAULT_PULL_STRATEGY}
              open={pullMenuOpen}
              onOpen={openPullMenu}
              onScheduleClose={schedulePullClose}
              onPull={pull}
            />
            <button
              onClick={() => { setCommitMenuOpen(false); setCreatingPR(true); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <PRMenuIcon />
              Create PR
            </button>
            <div className="my-1 border-t border-[var(--border)]" />
            <button
              onClick={() => { setCommitMenuOpen(false); setConfirmDiscardAllOpen(true); }}
              disabled={status.uncommitted === 0}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--accent-red)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <UndoIcon />
              Discard all changes
            </button>
          </div>
        )}
      </div>
      <CreateBranchModal
        open={creating}
        busy={busy}
        projectPath={projectPath}
        onClose={() => setCreating(false)}
        onCreate={create}
      />
      <CommitModal
        open={committing}
        projectPath={projectPath}
        onClose={() => setCommitting(false)}
        onCommitted={refresh}
      />
      <PRModal
        open={creatingPR}
        projectPath={projectPath}
        currentBranch={status.branch}
        onClose={() => setCreatingPR(false)}
        onCreated={refresh}
      />
      <ConfirmDialog
        open={confirmDiscardAllOpen}
        title="Discard all changes"
        variant="destructive"
        confirmLabel="Discard all"
        disabled={discarding}
        body={
          <>
            Reset the working tree to HEAD, discarding every uncommitted change
            (staged, unstaged, and untracked). This cannot be undone.
          </>
        }
        onCancel={() => setConfirmDiscardAllOpen(false)}
        onConfirm={handleDiscardAll}
      />
    </div>
  );
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? "animate-spin" : undefined}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-[var(--text-primary)]">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CommitIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <line x1="3" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="21" y2="12" />
    </svg>
  );
}

function PRMenuIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PullIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="5" y1="20" x2="19" y2="20" />
    </svg>
  );
}

function PullMenu({
  busy,
  currentStrategy,
  open,
  onOpen,
  onScheduleClose,
  onPull,
}: {
  busy: boolean;
  currentStrategy: GitPullStrategy;
  open: boolean;
  onOpen: () => void;
  onScheduleClose: () => void;
  onPull: (strategy: GitPullStrategy) => void;
}) {
  const currentLabel =
    PULL_STRATEGIES.find((s) => s.value === currentStrategy)?.label ?? "Pull";
  return (
    <div className="relative" onMouseEnter={onOpen} onMouseLeave={onScheduleClose}>
      <button
        onClick={() => onPull(currentStrategy)}
        disabled={busy}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        <PullIcon />
        {currentLabel}
        <span className="ml-auto flex text-[var(--text-muted)]"><ChevronLeftIcon /></span>
      </button>
      {open && (
        <div
          onMouseEnter={onOpen}
          onMouseLeave={onScheduleClose}
          className="absolute right-full bottom-0 w-44 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg"
        >
          {PULL_STRATEGIES.map((opt) => {
            const active = currentStrategy === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onPull(opt.value)}
                disabled={busy}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                <span className="w-3 shrink-0">{active && <CheckIcon />}</span>
                <span className={active ? "text-[var(--text-primary)]" : ""}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
