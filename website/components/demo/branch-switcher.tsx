"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";
import { GitActionsMenu, type PullStrategy } from "./git-actions-menu";
import { NO_AUTOFILL } from "./no-autofill";
import type { DemoBranch, DemoGit } from "./projects";
import { RemoteBadge } from "./remote-badge";
import { FOCUS_RING, PRESS } from "./ui";
import {
  DialogFooter,
  DialogHeader,
  DialogPanel,
  PrimaryButton,
  SecondaryButton,
} from "./ui-kit";

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// The app's git buttons sit on the terminal footer, so they take the composer
// border rather than the app-chrome one.
const FOOTER_BORDER = "border-[#cccccc]/[0.18]";

const AI_BRANCH_SUGGESTIONS = [
  "feature/rotate-jwt-keys",
  "fix/webhook-retry-backoff",
  "chore/upgrade-dependencies",
];

function BranchIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} strokeWidth={2}>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function CloudBranchIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} strokeWidth={2}>
      <path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78 6 6 0 0 0-11.6 2.28A4 4 0 0 0 6 19h11.5z" />
    </svg>
  );
}

function CopyIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function PencilIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    </svg>
  );
}

function TrashIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function CheckIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} strokeWidth={2.5}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlusIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} strokeWidth={2}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CommitIcon() {
  return (
    <svg {...ICON_PROPS} width={12} height={12} strokeWidth={2}>
      <circle cx="12" cy="12" r="3" />
      <line x1="3" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="21" y2="12" />
    </svg>
  );
}

function CloudOffIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} strokeWidth={2}>
      <path d="m2 2 20 20" />
      <path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193" />
      <path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07" />
    </svg>
  );
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      {...ICON_PROPS}
      width={12}
      height={12}
      strokeWidth={2}
      className={spinning ? "animate-spin" : undefined}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

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
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [branchOpen, commitMenuOpen]);

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
                className="w-full rounded-lg bg-transparent px-3 py-2 text-[13px] text-[#e5e5e5] placeholder:text-[#919191] focus:outline-none"
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

function MergeDialog({
  currentBranch,
  branches,
  onCancel,
  onMerge,
}: {
  currentBranch: string;
  branches: DemoBranch[];
  onCancel: () => void;
  onMerge: (branch: string) => void;
}) {
  const mergeable = useMemo(
    () =>
      branches.filter(
        (b) => (b.remote ? `${b.remote}/${b.name}` : b.name) !== currentBranch,
      ),
    [branches, currentBranch],
  );
  const [selected, setSelected] = useState<DemoBranch | undefined>(mergeable[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const labelOf = (b: DemoBranch) => (b.remote ? `${b.remote}/${b.name}` : b.name);

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 bg-black/50"
      />
      <DialogPanel className="relative">
        <DialogHeader
          title="Merge"
          description={
            <>
              Merge another branch into{" "}
              <span className="font-mono text-[#e5e5e5]">{currentBranch}</span>.
            </>
          }
        />
        <div className="mt-4">
          <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-[#919191]">
            Branch to merge
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              disabled={!selected}
              aria-expanded={pickerOpen}
              aria-haspopup="listbox"
              className={`flex w-full items-center gap-2.5 rounded-lg border border-[#2e2e2e] bg-[#242424] px-3 py-2 text-left text-[13px] text-[#e5e5e5] transition-colors hover:bg-[#2a2a2a] disabled:opacity-40 ${FOCUS_RING} ${PRESS}`}
            >
              {selected ? (
                <BranchOption b={selected} />
              ) : (
                <span className="flex-1 text-[#919191]">No other branches</span>
              )}
              <span className="shrink-0 text-[#919191]">
                <ChevronDownIcon />
              </span>
            </button>
            {pickerOpen && (
              <div className="menu-pop absolute left-0 right-0 top-full z-10 mt-1 max-h-52 overflow-y-auto rounded-xl border border-[#2e2e2e] bg-[#1a1a1a] py-1 shadow-2xl">
                {mergeable.map((b) => {
                  const active = selected && labelOf(b) === labelOf(selected);
                  return (
                    <button
                      key={labelOf(b)}
                      type="button"
                      onClick={() => {
                        setSelected(b);
                        setPickerOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-[#2a2a2a] ${
                        active ? "text-[#e5e5e5]" : "text-[#b3b3b3]"
                      }`}
                    >
                      <BranchOption b={b} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#2e2e2e] bg-[#242424] px-3 py-2 text-[11px] text-[#919191]">
          <span className="text-[#c084fc]">
            <SparkleGlyph />
          </span>
          Conflicts? lpm can resolve them with AI.
        </div>
        <DialogFooter>
          <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={() => selected && onMerge(labelOf(selected))}
            disabled={!selected}
          >
            Merge
          </PrimaryButton>
        </DialogFooter>
      </DialogPanel>
    </div>
  );
}

function BranchOption({ b }: { b: DemoBranch }) {
  return (
    <>
      <span className="shrink-0 text-[#919191]">
        {b.remote ? <CloudBranchIcon size={14} /> : <BranchIcon size={14} />}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono">{b.name}</span>
      {b.remote && <RemoteBadge remote={b.remote} />}
      {b.age && (
        <span className="shrink-0 text-[11px] tabular-nums text-[#919191]">
          {b.age}
        </span>
      )}
    </>
  );
}

function SparkleGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={12}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
    </svg>
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
