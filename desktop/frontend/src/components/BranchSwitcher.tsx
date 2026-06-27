import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  CheckoutBranch,
  CreateBranch,
  DeleteBranch,
  GitDiscardAll,
  GitFetchAll,
  GitPush,
  PullBranch,
  RenameBranch,
} from "../../bridge/commands";
import { getSettings } from "../store/settings";
import {
  DEFAULT_PULL_CONFIG,
  DEFAULT_PUSH_CONFIG,
  DEFAULT_FETCH_CONFIG,
  pullFlags,
  pushFlags,
  fetchFlags,
  type GitPullConfig,
  type GitPushConfig,
  type GitFetchConfig,
} from "../gitOptions";
import { DrillMenu } from "./DrillMenu";
import { PullSplitRow, pullConfigScreen } from "./pullMenu";
import { PushSplitRow, pushConfigScreen } from "./pushMenu";
import { FetchSplitRow, fetchConfigScreen } from "./fetchMenu";
import { main } from "../../bridge/models";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { useEventListener } from "../hooks/useEventListener";
import type { useGitStatus } from "../hooks/useGitStatus";
import { useBranchSearch } from "../hooks/useBranchSearch";
import { CreateBranchModal } from "./CreateBranchModal";
import { CommitModal } from "./CommitModal";
import { MergeBranchDialog } from "./MergeBranchDialog";
import { PRModal } from "./PRModal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import {
  BranchIcon,
  CloudBranchIcon,
  CopyIcon,
  PencilIcon,
  TrashIcon,
  UndoIcon,
} from "./icons";
import { branchKey, orderBranches, RemoteBadge } from "./branchUtils";
import { relativeTime } from "../relativeTime";

export function BranchSwitcher({
  projectName,
  projectPath,
  gitState,
}: {
  projectName: string;
  projectPath: string;
  gitState: ReturnType<typeof useGitStatus>;
}) {
  const { status, branches, refresh } = gitState;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchResults = useBranchSearch(projectPath, query, open);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [creatingPR, setCreatingPR] = useState(false);
  const [merging, setMerging] = useState(false);
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  const [confirmDiscardAllOpen, setConfirmDiscardAllOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingBranch, setDeletingBranch] = useState<main.Branch | null>(
    null,
  );
  const searchRef = useRef<HTMLInputElement>(null);

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
  const filtered = useMemo(
    () => orderBranches(branches, query, searchResults, current),
    [branches, query, searchResults, current],
  );

  if (!status?.isGitRepo) return null;

  const checkout = async (branch: main.Branch) => {
    if (busy || branch.name === status.branch) {
      setOpen(false);
      return;
    }
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

  const runPull = async (cfg: GitPullConfig) => {
    if (busy) return;
    setCommitMenuOpen(false);
    setBusy(true);
    try {
      await PullBranch(projectPath, cfg.strategy, pullFlags(cfg));
      await refresh();
    } catch (err) {
      toast.error(`Pull: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const runPullDefault = () =>
    runPull(getSettings().gitPull ?? DEFAULT_PULL_CONFIG);

  const runPush = async (cfg: GitPushConfig) => {
    if (busy) return;
    setCommitMenuOpen(false);
    setBusy(true);
    try {
      await GitPush(projectPath, pushFlags(cfg));
      await refresh();
      toast.success("Pushed");
    } catch (err) {
      toast.error(`Push: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const runPushDefault = () =>
    runPush(getSettings().gitPush ?? DEFAULT_PUSH_CONFIG);

  const runFetch = async (cfg: GitFetchConfig) => {
    if (busy) return;
    setCommitMenuOpen(false);
    setBusy(true);
    try {
      await GitFetchAll(projectPath, fetchFlags(cfg));
      await refresh();
      toast.success("Fetched");
    } catch (err) {
      toast.error(`Fetch: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const runFetchDefault = () =>
    runFetch(getSettings().gitFetch ?? DEFAULT_FETCH_CONFIG);

  const runSync = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const pull = getSettings().gitPull ?? DEFAULT_PULL_CONFIG;
      const push = getSettings().gitPush ?? DEFAULT_PUSH_CONFIG;
      await PullBranch(projectPath, pull.strategy, pullFlags(pull));
      await GitPush(projectPath, pushFlags(push));
      await refresh();
    } catch (err) {
      toast.error(`Sync: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const syncToolbarAction = () => {
    if (status.behind > 0 && status.ahead > 0) return runSync();
    if (status.behind > 0) return runPullDefault();
    return runPushDefault();
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

  const startRename = (b: main.Branch) => {
    setRenamingKey(branchKey(b));
    setRenameValue(b.name);
  };

  const submitRename = async (b: main.Branch) => {
    const newName = renameValue.trim();
    if (!newName || newName === b.name) {
      setRenamingKey(null);
      return;
    }
    setBusy(true);
    try {
      await RenameBranch(projectPath, b.name, newName);
      await refresh();
      setRenamingKey(null);
    } catch (err) {
      toast.error(`Rename ${b.name}: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const copyBranchName = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      toast.success("Copied branch name");
    } catch {
      toast.error("Copy failed");
    }
  };

  const handleDelete = async () => {
    const b = deletingBranch;
    if (!b) return;
    setBusy(true);
    try {
      await DeleteBranch(projectPath, b.name);
      await refresh();
      setDeletingBranch(null);
    } catch (err) {
      toast.error(`Delete ${b.name}: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const needsSync =
    status.hasUpstream && (status.ahead > 0 || status.behind > 0);

  return (
    <div className="flex items-center gap-1">
      {needsSync && (
        <button
          onClick={syncToolbarAction}
          disabled={busy}
          title={
            busy ? "Syncing…" : `Pull ${status.behind}, push ${status.ahead}`
          }
          className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <SyncIcon spinning={busy} />
          {status.behind > 0 && (
            <span className="tabular-nums">{status.behind}↓</span>
          )}
          {status.ahead > 0 && (
            <span className="tabular-nums">{status.ahead}↑</span>
          )}
        </button>
      )}
      <div ref={ref} className="relative">
        <button
          onClick={toggleOpen}
          title={busy ? "Switching branch…" : "Switch branch"}
          disabled={busy}
          className={`flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
            open
              ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          <BranchIcon size={12} />
          <span className="max-w-32 truncate font-mono">
            {status.branch || "detached"}
          </span>
          {status.uncommitted > 0 && (
            <span
              className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-blue)]"
              title={`${status.uncommitted} uncommitted file${status.uncommitted === 1 ? "" : "s"}`}
            />
          )}
          <ChevronDown />
        </button>

        {open && (
          <div className="absolute bottom-full right-0 z-50 mb-2 w-[520px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
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
                className="w-full rounded-lg bg-transparent px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
            </div>
            <div className="max-h-[360px] overflow-y-auto py-1.5">
              <div className="px-4 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Branches
              </div>
              {filtered.length === 0 && (
                <div className="px-4 py-3 text-[13px] text-[var(--text-muted)]">
                  No matches
                </div>
              )}
              {filtered.map((b) => {
                const isCurrent = b.name === status.branch;
                const age = relativeTime(b.committerDate);
                const key = branchKey(b);
                const isRenaming = renamingKey === key;
                const canRename = !b.remote;
                const canDelete = !b.remote && !isCurrent;
                return (
                  <div
                    key={key}
                    className="group relative flex w-full items-center transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    {isRenaming ? (
                      <div className="flex w-full items-center gap-2.5 px-4 py-2 text-[13px]">
                        <BranchIcon size={14} />
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              submitRename(b);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              setRenamingKey(null);
                            }
                          }}
                          onBlur={() => setRenamingKey(null)}
                          className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-0.5 text-[13px] text-[var(--text-primary)] focus:border-[var(--text-muted)] focus:outline-none"
                        />
                        <button
                          type="button"
                          title="Save"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => submitRename(b)}
                          disabled={
                            busy ||
                            !renameValue.trim() ||
                            renameValue.trim() === b.name
                          }
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--accent-blue)] transition-colors hover:bg-[var(--bg-active)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => checkout(b)}
                          disabled={busy}
                          title={
                            b.remote
                              ? `Create local tracking branch from ${b.remote}/${b.name}`
                              : undefined
                          }
                          className={`flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2 text-left text-[13px] disabled:opacity-50 ${isCurrent ? "text-[var(--accent-blue)]" : "text-[var(--text-secondary)]"}`}
                        >
                          {b.remote ? (
                            <CloudBranchIcon size={14} />
                          ) : (
                            <BranchIcon size={14} />
                          )}
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate">{b.name}</span>
                              {b.remote && <RemoteBadge remote={b.remote} />}
                            </span>
                            {isCurrent && status.uncommitted > 0 && (
                              <span className="text-[11px] text-[var(--text-muted)]">
                                Uncommitted: {status.uncommitted} file
                                {status.uncommitted === 1 ? "" : "s"}
                              </span>
                            )}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-1 pr-4">
                          <div className="hidden items-center gap-0.5 pr-1 group-hover:flex">
                            <BranchActionButton
                              title="Copy branch name"
                              onClick={() => copyBranchName(b.name)}
                            >
                              <CopyIcon size={13} />
                            </BranchActionButton>
                            {canRename && (
                              <BranchActionButton
                                title="Rename branch"
                                onClick={() => startRename(b)}
                              >
                                <PencilIcon size={13} />
                              </BranchActionButton>
                            )}
                            {canDelete && (
                              <BranchActionButton
                                title="Delete branch"
                                onClick={() => setDeletingBranch(b)}
                                danger
                              >
                                <TrashIcon size={13} />
                              </BranchActionButton>
                            )}
                          </div>
                          {age && (
                            <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
                              {age}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-[var(--border)]">
              <button
                onClick={() => {
                  setOpen(false);
                  setCreating(true);
                }}
                disabled={busy}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                <PlusIcon />
                <span>Create and checkout new branch…</span>
              </button>
            </div>
          </div>
        )}
      </div>
      <div
        ref={commitMenuRef}
        className="relative flex rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]"
      >
        <button
          onClick={() => setCommitting(true)}
          disabled={busy || status.uncommitted === 0}
          title={
            status.uncommitted > 0 ? "Commit changes" : "No changes to commit"
          }
          className="flex items-center gap-1 rounded-l-md px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
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
          className={`flex items-center rounded-r-md border-l border-[var(--border)] px-2 py-1 transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 ${
            commitMenuOpen
              ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)]"
          }`}
        >
          <ChevronDown />
        </button>
        {commitMenuOpen && (
          <div className="absolute bottom-full right-0 z-10 mb-2">
            <DrillMenu
              root={{
                render: (api) => (
                  <>
                    <button
                      onClick={() => {
                        setCommitMenuOpen(false);
                        setCommitting(true);
                      }}
                      disabled={status.uncommitted === 0}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
                    >
                      <CommitIcon size={14} />
                      Commit
                    </button>
                    <PullSplitRow
                      busy={busy}
                      onRun={runPullDefault}
                      onConfigure={() =>
                        api.push(
                          pullConfigScreen({ busy, onRun: runPullDefault }),
                        )
                      }
                    />
                    <PushSplitRow
                      busy={busy}
                      onRun={runPushDefault}
                      onConfigure={() =>
                        api.push(
                          pushConfigScreen({ busy, onRun: runPushDefault }),
                        )
                      }
                    />
                    <FetchSplitRow
                      busy={busy}
                      onRun={runFetchDefault}
                      onConfigure={() =>
                        api.push(
                          fetchConfigScreen({ busy, onRun: runFetchDefault }),
                        )
                      }
                    />
                    <button
                      onClick={() => {
                        setCommitMenuOpen(false);
                        setCreatingPR(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    >
                      <PRMenuIcon />
                      Create PR
                    </button>
                    <button
                      onClick={() => {
                        setCommitMenuOpen(false);
                        setMerging(true);
                      }}
                      disabled={busy}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <MergeMenuIcon />
                      Merge
                    </button>
                    <div className="my-1.5 border-t border-[var(--border)]" />
                    <button
                      onClick={() => {
                        setCommitMenuOpen(false);
                        setConfirmDiscardAllOpen(true);
                      }}
                      disabled={status.uncommitted === 0}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--accent-red)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <UndoIcon />
                      Discard all changes
                    </button>
                  </>
                ),
              }}
              onClose={() => setCommitMenuOpen(false)}
            />
          </div>
        )}
      </div>
      <CreateBranchModal
        open={creating}
        busy={busy}
        projectName={projectName}
        projectPath={projectPath}
        onClose={() => setCreating(false)}
        onCreate={create}
      />
      <CommitModal
        open={committing}
        projectName={projectName}
        projectPath={projectPath}
        onClose={() => setCommitting(false)}
        onCommitted={refresh}
      />
      <PRModal
        open={creatingPR}
        projectName={projectName}
        projectPath={projectPath}
        currentBranch={status.branch}
        onClose={() => setCreatingPR(false)}
        onCreated={refresh}
      />
      <MergeBranchDialog
        open={merging}
        projectPath={projectPath}
        currentBranch={status.branch}
        branches={branches}
        onClose={() => setMerging(false)}
        onMerged={refresh}
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
      <ConfirmDialog
        open={deletingBranch !== null}
        title="Delete branch"
        variant="destructive"
        confirmLabel="Delete"
        disabled={busy}
        body={
          <>
            Delete local branch{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {deletingBranch?.name}
            </span>
            ? This removes it even if it has unmerged commits.
          </>
        }
        onCancel={() => setDeletingBranch(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function BranchActionButton({
  title,
  onClick,
  children,
  danger = false,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-active)] ${danger ? "hover:text-[var(--accent-red)]" : "hover:text-[var(--text-primary)]"}`}
    >
      {children}
    </button>
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
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CommitIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <line x1="3" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="21" y2="12" />
    </svg>
  );
}

function PRMenuIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function MergeMenuIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M6 9v6" />
      <path d="M6 21a12 12 0 0 0 12-12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
