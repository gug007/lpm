"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";
import {
  BranchIcon,
  CheckIcon,
  ChevronDownIcon,
  CloudBranchIcon,
  CloudOffIcon,
  CommitIcon,
  CopyIcon,
  PencilIcon,
  PlusIcon,
  SyncIcon,
  TrashIcon,
} from "./branch-icons";
import { GitActionsMenu, type PullStrategy } from "./git-actions-menu";
import { MergeDialog } from "./merge-dialog";
import { NO_AUTOFILL } from "./no-autofill";
import type { DemoBranch, DemoGit } from "./projects";
import { RemoteBadge } from "./remote-badge";
import { SparkleGlyph } from "./sparkle-glyph";
import { FOCUS_RING, PRESS } from "./ui";

// The app's git buttons sit on the terminal footer, so they take the composer
// border rather than the app-chrome one.
const FOOTER_BORDER = "border-[#cccccc]/[0.18]";

const AI_BRANCH_SUGGESTIONS = [
  "feature/rotate-jwt-keys",
  "fix/webhook-retry-backoff",
  "chore/upgrade-dependencies",
];

type BranchSwitcherProps = {
  git: DemoGit;
  busy?: boolean;
  onCheckout: (branch: DemoBranch) => void;
  onCommit: () => void;
  onPull: (strategy: PullStrategy) => void;
  onPush: () => void;
  onFetch: () => void;
  onMerge: (branch: string) => void;
  onCreatePR: () => void;
  onDiscard: () => void;
  onSync: () => void;
  onCreateBranch: (name: string) => void;
  onRenameBranch: (oldName: string, newName: string) => void;
  onDeleteBranch: (name: string) => void;
  onRemoveRemote: (branch: DemoBranch) => void;
  onCopyBranchName: (name: string) => void;
};

export function DemoBranchSwitcher({
  git,
  busy = false,
  onCheckout,
  onCommit,
  onPull,
  onPush,
  onFetch,
  onMerge,
  onCreatePR,
  onDiscard,
  onSync,
  onCreateBranch,
  onRenameBranch,
  onDeleteBranch,
  onRemoveRemote,
  onCopyBranchName,
}: BranchSwitcherProps) {
  const [branchOpen, setBranchOpen] = useState(false);
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  const [pullStrategy, setPullStrategy] = useState<PullStrategy>("ff");
  const [mergePicker, setMergePicker] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [generatingName, setGeneratingName] = useState(false);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DemoBranch | null>(null);
  const [removingRemote, setRemovingRemote] = useState<DemoBranch | null>(null);
  const branchRef = useRef<HTMLDivElement>(null);
  const commitRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const newBranchRef = useRef<HTMLInputElement>(null);
  const genTimer = useRef<number | null>(null);
  const genIdxRef = useRef(0);

  const generateBranchName = () => {
    setGeneratingName(true);
    if (genTimer.current) window.clearTimeout(genTimer.current);
    genTimer.current = window.setTimeout(() => {
      const suggestion =
        AI_BRANCH_SUGGESTIONS[genIdxRef.current % AI_BRANCH_SUGGESTIONS.length];
      genIdxRef.current += 1;
      setNewBranchName(suggestion);
      setGeneratingName(false);
      newBranchRef.current?.focus();
    }, 650);
  };

  const closeBranchMenu = () => {
    // Otherwise the pending suggestion lands in — and refocuses — a menu the
    // visitor already dismissed.
    if (genTimer.current) {
      window.clearTimeout(genTimer.current);
      genTimer.current = null;
    }
    setBranchOpen(false);
    setQuery("");
    setCreating(false);
    setNewBranchName("");
    setGeneratingName(false);
    setRenamingKey(null);
  };

  useEffect(() => {
    if (!branchOpen && !commitMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (branchOpen && branchRef.current && !branchRef.current.contains(target)) {
        closeBranchMenu();
      }
      if (commitMenuOpen && commitRef.current && !commitRef.current.contains(target)) {
        setCommitMenuOpen(false);
      }
    };
    // The rename and new-branch inputs only preventDefault on Escape, so without
    // this guard the first Escape typed in them would tear down the popover too.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && branchOpen && !creating && !renamingKey) {
        closeBranchMenu();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [branchOpen, commitMenuOpen, creating, renamingKey]);

  useEffect(() => {
    if (branchOpen && !creating) searchRef.current?.focus();
    if (creating) newBranchRef.current?.focus();
  }, [branchOpen, creating]);

  useEffect(() => () => {
    if (genTimer.current) window.clearTimeout(genTimer.current);
  }, []);

  const needsSync = git.ahead > 0 || git.behind > 0;

  const branchKey = (b: DemoBranch) =>
    b.remote ? `remote:${b.remote}:${b.name}` : `local:${b.name}`;

  const filtered = useMemo(() => {
    const base = !query
      ? git.branches
      : git.branches.filter((b) =>
          (b.remote ? `${b.remote}/${b.name}` : b.name)
            .toLowerCase()
            .includes(query.toLowerCase()),
        );
    const rank = (b: DemoBranch) =>
      b.name === git.branch && !b.remote ? 0 : b.remote ? 2 : 1;
    return [...base].sort((a, b) => rank(a) - rank(b));
  }, [git.branches, git.branch, query]);

  const submitCreate = () => {
    const name = newBranchName.trim();
    if (!name) return;
    onCreateBranch(name);
    closeBranchMenu();
  };

  const submitRename = (b: DemoBranch) => {
    const newName = renameValue.trim();
    if (!newName || newName === b.name) {
      setRenamingKey(null);
      return;
    }
    onRenameBranch(b.name, newName);
    setRenamingKey(null);
  };

  const handlePull = (strategy: PullStrategy) => {
    setPullStrategy(strategy);
    setCommitMenuOpen(false);
    onPull(strategy);
  };

  return (
    <div className="flex items-center gap-1.5">
      {needsSync && (
        <button
          type="button"
          onClick={onSync}
          disabled={busy}
          aria-label={busy ? "Syncing" : `Sync: pull ${git.behind}, push ${git.ahead}`}
          title={busy ? "Syncing…" : `Pull ${git.behind}, push ${git.ahead}`}
          className={`flex items-center gap-1 rounded-md border ${FOOTER_BORDER} bg-[#262626] px-2.5 py-1 text-[11px] font-medium text-[#b3b3b3] hover:bg-white/[0.06] hover:text-[#e5e5e5] disabled:opacity-40 ${PRESS} ${FOCUS_RING}`}
        >
          <SyncIcon spinning={busy} />
          {git.behind > 0 && (
            <span className="tabular-nums">{git.behind}↓</span>
          )}
          {git.ahead > 0 && (
            <span className="tabular-nums">{git.ahead}↑</span>
          )}
        </button>
      )}

      <div ref={branchRef} className="relative">
        <button
          type="button"
          onClick={() => {
            setCommitMenuOpen(false);
            if (branchOpen) closeBranchMenu();
            else setBranchOpen(true);
          }}
          disabled={busy}
          aria-label={`Current branch: ${git.branch}. Switch branch`}
          aria-expanded={branchOpen}
          aria-haspopup="menu"
          title={busy ? "Switching branch…" : "Switch branch"}
          className={`flex items-center gap-1.5 rounded-md border ${FOOTER_BORDER} px-2.5 py-1 text-[11px] font-medium disabled:opacity-40 ${PRESS} ${FOCUS_RING} ${
            branchOpen
              ? "bg-white/[0.06] text-[#e5e5e5]"
              : "bg-[#262626] text-[#b3b3b3] hover:bg-white/[0.06] hover:text-[#e5e5e5]"
          }`}
        >
          <BranchIcon />
          <span className="max-w-[160px] truncate font-mono">{git.branch}</span>
          {git.uncommitted > 0 && (
            <span
              className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[#60a5fa]"
              title={`${git.uncommitted} uncommitted file${git.uncommitted === 1 ? "" : "s"}`}
            />
          )}
          <ChevronDownIcon />
        </button>

        {branchOpen && (
          <div className="switcher-in absolute bottom-full right-0 z-50 mb-2 w-[520px] origin-bottom-right overflow-hidden rounded-2xl border border-[#2e2e2e] bg-[#1a1a1a] shadow-2xl">
            <div className="border-b border-[#2e2e2e] p-2">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search branches"
                {...NO_AUTOFILL}
                className={`w-full rounded-lg bg-transparent px-3 py-2 text-[13px] text-[#e5e5e5] placeholder:text-[#919191] ${FOCUS_RING}`}
              />
            </div>
            <div className="max-h-[300px] overflow-y-auto py-1.5">
              <div className="px-4 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#919191]">
                Branches
              </div>
              {filtered.length === 0 && (
                <div className="px-4 py-3 text-[13px] text-[#919191]">
                  No matches
                </div>
              )}
              {filtered.map((b) => {
                const isCurrent = !b.remote && b.name === git.branch;
                const key = branchKey(b);
                const isRenaming = renamingKey === key;
                const canRename = !b.remote;
                const canDelete = !b.remote && !isCurrent;
                return (
                  <div
                    key={key}
                    className="group relative flex w-full items-center transition-colors hover:bg-[#2a2a2a]"
                  >
                    {isRenaming ? (
                      <div className="flex w-full items-center gap-2.5 px-4 py-2 text-[13px]">
                        <BranchIcon size={14} />
                        <input
                          autoFocus
                          {...NO_AUTOFILL}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          aria-label={`New name for branch ${b.name}`}
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
                          className="min-w-0 flex-1 rounded border border-[#2e2e2e] bg-[#1a1a1a] px-1.5 py-0.5 text-[13px] text-[#e5e5e5] outline-none focus:border-[#22d3ee]"
                        />
                        <button
                          type="button"
                          title="Save"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => submitRename(b)}
                          disabled={!renameValue.trim() || renameValue.trim() === b.name}
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#60a5fa] transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
                        >
                          <CheckIcon size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onCheckout(b);
                            closeBranchMenu();
                          }}
                          disabled={busy}
                          title={
                            b.remote
                              ? `Create local tracking branch from ${b.remote}/${b.name}`
                              : undefined
                          }
                          className={`flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2 text-left text-[13px] disabled:opacity-50 ${
                            isCurrent ? "text-[#60a5fa]" : "text-[#b3b3b3]"
                          }`}
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
                            {isCurrent && git.uncommitted > 0 && (
                              <span className="text-[11px] text-[#919191]">
                                Uncommitted: {git.uncommitted} file
                                {git.uncommitted === 1 ? "" : "s"}
                              </span>
                            )}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-1 pr-4">
                          <div className="flex items-center gap-0.5 pr-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                            <BranchActionButton
                              title="Copy branch name"
                              onClick={() => onCopyBranchName(b.name)}
                            >
                              <CopyIcon size={13} />
                            </BranchActionButton>
                            {canRename && (
                              <BranchActionButton
                                title="Rename branch"
                                onClick={() => {
                                  setRenamingKey(key);
                                  setRenameValue(b.name);
                                }}
                              >
                                <PencilIcon size={13} />
                              </BranchActionButton>
                            )}
                            {canDelete && (
                              <BranchActionButton
                                title="Delete branch"
                                danger
                                onClick={() => setConfirmDelete(b)}
                              >
                                <TrashIcon size={13} />
                              </BranchActionButton>
                            )}
                            {b.remote && (
                              <BranchActionButton
                                title="Remove from list"
                                onClick={() => setRemovingRemote(b)}
                              >
                                <CloudOffIcon size={13} />
                              </BranchActionButton>
                            )}
                          </div>
                          {b.age && (
                            <span className="text-[11px] text-[#919191] tabular-nums">
                              {b.age}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-[#2e2e2e]">
              {creating ? (
                <div className="px-4 py-2">
                  <div className="flex items-center gap-2.5">
                    <PlusIcon size={14} />
                    <input
                      ref={newBranchRef}
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      placeholder="new-branch-name"
                      {...NO_AUTOFILL}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitCreate();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setCreating(false);
                          setNewBranchName("");
                        }
                      }}
                      className="min-w-0 flex-1 rounded border border-[#2e2e2e] bg-[#1a1a1a] px-1.5 py-0.5 font-mono text-[13px] text-[#e5e5e5] outline-none focus:border-[#22d3ee]"
                    />
                    <button
                      type="button"
                      title="Create"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={submitCreate}
                      disabled={!newBranchName.trim()}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#60a5fa] transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
                    >
                      <CheckIcon size={14} />
                    </button>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <span
                      className={`magic-ring group inline-flex rounded-full p-px shadow-sm ${PRESS} ${
                        generatingName
                          ? "animate-[gradient-spin_2.5s_linear_infinite]"
                          : ""
                      }`}
                    >
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={generateBranchName}
                        disabled={generatingName}
                        className={`inline-flex items-center gap-1.5 rounded-full bg-[#1a1a1a] px-3 py-1 text-xs font-medium text-[#e5e5e5] transition-colors group-hover:bg-transparent group-hover:text-white disabled:opacity-70 ${FOCUS_RING}`}
                      >
                        <span className={generatingName ? "animate-spin" : ""}>
                          <SparkleGlyph />
                        </span>
                        {generatingName ? "Generating…" : "Generate with AI"}
                      </button>
                    </span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  disabled={busy}
                  className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:opacity-50 ${FOCUS_RING}`}
                >
                  <PlusIcon size={14} />
                  <span>Create and checkout new branch…</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        ref={commitRef}
        className={`relative flex rounded-md border ${FOOTER_BORDER} bg-[#262626]`}
      >
        <button
          type="button"
          onClick={onCommit}
          disabled={busy || git.uncommitted === 0}
          title={
            git.uncommitted > 0 ? "Commit changes" : "No changes to commit"
          }
          className={`flex items-center gap-1 rounded-l-md px-2.5 py-1 text-[11px] font-medium text-[#b3b3b3] hover:bg-white/[0.06] hover:text-[#e5e5e5] disabled:cursor-not-allowed disabled:opacity-40 ${PRESS} ${FOCUS_RING}`}
        >
          <CommitIcon />
          <span>Commit</span>
          {git.uncommitted > 0 && (
            <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[#60a5fa]" />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            closeBranchMenu();
            setCommitMenuOpen((v) => !v);
          }}
          disabled={busy}
          title="More git actions"
          aria-expanded={commitMenuOpen}
          aria-haspopup="menu"
          className={`flex items-center rounded-r-md border-l ${FOOTER_BORDER} px-1.5 py-1 hover:bg-white/[0.06] hover:text-[#e5e5e5] disabled:opacity-40 ${PRESS} ${FOCUS_RING} ${
            commitMenuOpen ? "bg-white/[0.06] text-[#e5e5e5]" : "text-[#b3b3b3]"
          }`}
        >
          <ChevronDownIcon />
        </button>

        {commitMenuOpen && (
          <GitActionsMenu
            busy={busy}
            uncommitted={git.uncommitted}
            pullStrategy={pullStrategy}
            onSelectPullStrategy={setPullStrategy}
            onCommit={() => {
              setCommitMenuOpen(false);
              onCommit();
            }}
            onPull={handlePull}
            onPush={() => {
              setCommitMenuOpen(false);
              onPush();
            }}
            onFetch={() => {
              setCommitMenuOpen(false);
              onFetch();
            }}
            onCreatePR={() => {
              setCommitMenuOpen(false);
              onCreatePR();
            }}
            onMerge={() => {
              setCommitMenuOpen(false);
              setMergePicker(true);
            }}
            onAutoCommit={() => {
              setCommitMenuOpen(false);
              onCommit();
            }}
            onAutoCommitAndPush={() => {
              setCommitMenuOpen(false);
              onCommit();
              onPush();
            }}
            onDiscard={() => {
              setCommitMenuOpen(false);
              setConfirmDiscard(true);
            }}
          />
        )}
      </div>

      {confirmDiscard && (
        <ConfirmDialog
          title="Discard all changes"
          confirmLabel="Discard all"
          danger
          body="Reset the working tree to HEAD, discarding every uncommitted change (staged, unstaged, and untracked). This cannot be undone."
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            onDiscard();
            setConfirmDiscard(false);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete branch"
          confirmLabel="Delete"
          danger
          body={
            <>
              Delete local branch{" "}
              <span className="font-medium text-[#e5e5e5]">{confirmDelete.name}</span>?
              This removes it even if it has unmerged commits.
            </>
          }
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            onDeleteBranch(confirmDelete.name);
            setConfirmDelete(null);
          }}
        />
      )}

      {mergePicker && (
        <MergeDialog
          currentBranch={git.branch}
          branches={git.branches}
          onCancel={() => setMergePicker(false)}
          onMerge={(branch) => {
            onMerge(branch);
            setMergePicker(false);
          }}
        />
      )}

      {removingRemote && (
        <ConfirmDialog
          title="Remove branch from list"
          confirmLabel="Remove"
          body={
            <>
              Remove{" "}
              <span className="font-medium text-[#e5e5e5]">
                {removingRemote.remote}/{removingRemote.name}
              </span>
              ? This clears the copy lpm keeps locally — it doesn&apos;t change
              anything on the remote. If the branch still exists there, it will
              come back the next time you fetch.
            </>
          }
          onCancel={() => setRemovingRemote(null)}
          onConfirm={() => {
            onRemoveRemote(removingRemote);
            setRemovingRemote(null);
          }}
        />
      )}
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
  children: React.ReactNode;
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
      className={`flex h-5 w-5 items-center justify-center rounded text-[#919191] transition-colors hover:bg-[#333333] ${FOCUS_RING} ${
        danger ? "hover:text-[#f87171]" : "hover:text-[#e5e5e5]"
      }`}
    >
      {children}
    </button>
  );
}
