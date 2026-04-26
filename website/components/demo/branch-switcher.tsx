"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DemoBranch, DemoGit } from "./projects";

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

function UndoIcon() {
  return (
    <svg {...ICON_PROPS} width={12} height={12}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 2.7L3 13" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...ICON_PROPS} width={12} height={12} strokeWidth={2}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg {...ICON_PROPS} width={12} height={12}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg {...ICON_PROPS} width={10} height={10} strokeWidth={2.5}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg {...ICON_PROPS} width={12} height={12}>
      <polyline points="15 18 9 12 15 6" />
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

function PRIcon() {
  return (
    <svg {...ICON_PROPS} width={12} height={12} strokeWidth={2}>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function PullIcon() {
  return (
    <svg {...ICON_PROPS} width={12} height={12} strokeWidth={2}>
      <path d="M12 4v11" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="5" y1="20" x2="19" y2="20" />
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

type PullStrategy = "ff-only" | "rebase";

const PULL_STRATEGIES: { value: PullStrategy; label: string }[] = [
  { value: "ff-only", label: "Pull" },
  { value: "rebase", label: "Pull (Rebase)" },
];

type BranchSwitcherProps = {
  git: DemoGit;
  busy?: boolean;
  onCheckout: (branch: DemoBranch) => void;
  onCommit: () => void;
  onPull: (strategy: PullStrategy) => void;
  onCreatePR: () => void;
  onDiscard: () => void;
  onSync: () => void;
  onCreateBranch: (name: string) => void;
  onRenameBranch: (oldName: string, newName: string) => void;
  onDeleteBranch: (name: string) => void;
  onCopyBranchName: (name: string) => void;
};

export function DemoBranchSwitcher({
  git,
  busy = false,
  onCheckout,
  onCommit,
  onPull,
  onCreatePR,
  onDiscard,
  onSync,
  onCreateBranch,
  onRenameBranch,
  onDeleteBranch,
  onCopyBranchName,
}: BranchSwitcherProps) {
  const [branchOpen, setBranchOpen] = useState(false);
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  const [pullMenuOpen, setPullMenuOpen] = useState(false);
  const [pullStrategy, setPullStrategy] = useState<PullStrategy>("ff-only");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DemoBranch | null>(null);
  const branchRef = useRef<HTMLDivElement>(null);
  const commitRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const newBranchRef = useRef<HTMLInputElement>(null);
  const pullCloseTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!branchOpen && !commitMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (branchOpen && branchRef.current && !branchRef.current.contains(target)) {
        setBranchOpen(false);
        setCreating(false);
        setRenamingKey(null);
      }
      if (commitMenuOpen && commitRef.current && !commitRef.current.contains(target)) {
        setCommitMenuOpen(false);
        setPullMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [branchOpen, commitMenuOpen]);

  useEffect(() => {
    if (branchOpen && !creating) searchRef.current?.focus();
    if (creating) newBranchRef.current?.focus();
    if (!branchOpen) {
      setQuery("");
      setCreating(false);
      setNewBranchName("");
      setRenamingKey(null);
    }
  }, [branchOpen, creating]);

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
    setCreating(false);
    setNewBranchName("");
    setBranchOpen(false);
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
    setPullMenuOpen(false);
    onPull(strategy);
  };

  const currentPullLabel =
    PULL_STRATEGIES.find((s) => s.value === pullStrategy)?.label ?? "Pull";

  return (
    <div className="flex items-center gap-1.5">
      {needsSync && (
        <button
          type="button"
          onClick={onSync}
          disabled={busy}
          title={busy ? "Syncing…" : `Pull ${git.behind}, push ${git.ahead}`}
          className="flex items-center gap-1 rounded-md border border-[#2e2e2e] bg-[#242424] px-2 py-1 text-[10px] font-medium text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:opacity-50"
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
            setBranchOpen((v) => !v);
          }}
          disabled={busy}
          title={busy ? "Switching branch…" : "Switch branch"}
          className="flex items-center gap-1.5 rounded-md border border-[#2e2e2e] bg-[#242424] px-2.5 py-1 text-[10px] font-medium text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:opacity-50"
        >
          <BranchIcon />
          <span className="max-w-[160px] truncate">{git.branch}</span>
          {git.uncommitted > 0 && (
            <span
              className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[#919191]"
              title={`${git.uncommitted} uncommitted file${git.uncommitted === 1 ? "" : "s"}`}
            />
          )}
          <ChevronDownIcon />
        </button>

        {branchOpen && (
          <div className="absolute bottom-full right-0 z-50 mb-1 w-96 overflow-hidden rounded-lg border border-[#2e2e2e] bg-[#242424] shadow-xl">
            <div className="border-b border-[#2e2e2e] p-2">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search branches"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="w-full rounded-md bg-[#1a1a1a] px-2 py-1 text-[11px] text-[#e5e5e5] placeholder:text-[#919191] outline-none border border-transparent focus:border-[#3a3a3a]"
              />
            </div>
            <div className="max-h-[250px] overflow-y-auto py-1">
              <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[#919191]">
                Branches
              </div>
              {filtered.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-[#919191]">
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
                      <div className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px]">
                        <BranchIcon />
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
                          className="min-w-0 flex-1 rounded border border-[#3a3a3a] bg-[#1a1a1a] px-1 py-0.5 text-[11px] text-[#e5e5e5] outline-none focus:border-[#5a5a5a]"
                        />
                        <button
                          type="button"
                          title="Save"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => submitRename(b)}
                          disabled={!renameValue.trim() || renameValue.trim() === b.name}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-cyan-400 transition-colors hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <CheckIcon />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onCheckout(b);
                            setBranchOpen(false);
                          }}
                          disabled={busy}
                          title={
                            b.remote
                              ? `Create local tracking branch from ${b.remote}/${b.name}`
                              : undefined
                          }
                          className={`flex min-w-0 flex-1 items-start gap-2 px-3 py-1.5 text-left text-[11px] disabled:opacity-50 ${
                            isCurrent ? "text-cyan-300" : "text-[#b3b3b3]"
                          }`}
                        >
                          {b.remote ? <CloudBranchIcon /> : <BranchIcon />}
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-mono">{b.name}</span>
                              {b.remote && (
                                <span className="rounded bg-[#1f1f1f] px-1 py-px text-[9px] font-mono text-[#919191]">
                                  {b.remote}
                                </span>
                              )}
                            </span>
                            {isCurrent && git.uncommitted > 0 && (
                              <span className="text-[10px] text-[#919191]">
                                Uncommitted: {git.uncommitted} file
                                {git.uncommitted === 1 ? "" : "s"}
                              </span>
                            )}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-1 pr-3">
                          <div className="hidden items-center gap-0.5 pr-1 group-hover:flex">
                            <BranchActionButton
                              title="Copy branch name"
                              onClick={() => onCopyBranchName(b.name)}
                            >
                              <CopyIcon />
                            </BranchActionButton>
                            {canRename && (
                              <BranchActionButton
                                title="Rename branch"
                                onClick={() => {
                                  setRenamingKey(key);
                                  setRenameValue(b.name);
                                }}
                              >
                                <PencilIcon />
                              </BranchActionButton>
                            )}
                            {canDelete && (
                              <BranchActionButton
                                title="Delete branch"
                                danger
                                onClick={() => setConfirmDelete(b)}
                              >
                                <TrashIcon />
                              </BranchActionButton>
                            )}
                          </div>
                          {b.age && (
                            <span className="text-[10px] text-[#919191] tabular-nums">
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
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <PlusIcon />
                  <input
                    ref={newBranchRef}
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="new-branch-name"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
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
                    className="min-w-0 flex-1 rounded border border-[#3a3a3a] bg-[#1a1a1a] px-1 py-0.5 text-[11px] font-mono text-[#e5e5e5] outline-none focus:border-[#5a5a5a]"
                  />
                  <button
                    type="button"
                    title="Create"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={submitCreate}
                    disabled={!newBranchName.trim()}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-cyan-400 transition-colors hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CheckIcon />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  disabled={busy}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:opacity-50"
                >
                  <PlusIcon />
                  <span>Create and checkout new branch…</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div ref={commitRef} className="relative flex">
        <button
          type="button"
          onClick={onCommit}
          disabled={busy || git.uncommitted === 0}
          title={
            git.uncommitted > 0 ? "Commit changes" : "No changes to commit"
          }
          className="flex items-center gap-1 rounded-l-md border border-r-0 border-[#2e2e2e] bg-[#242424] px-2 py-1 text-[10px] font-medium text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CommitIcon />
          <span>Commit</span>
          {git.uncommitted > 0 && (
            <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-cyan-400" />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setBranchOpen(false);
            setCommitMenuOpen((v) => !v);
          }}
          disabled={busy}
          title="More git actions"
          className="flex items-center rounded-r-md border border-[#2e2e2e] bg-[#242424] px-1 py-1 text-[#919191] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:opacity-50"
        >
          <ChevronDownIcon />
        </button>

        {commitMenuOpen && (
          <div className="absolute bottom-full right-0 z-50 mb-1 w-56 rounded-lg border border-[#2e2e2e] bg-[#242424] py-1 shadow-xl">
            <button
              type="button"
              onClick={() => {
                setCommitMenuOpen(false);
                onCommit();
              }}
              disabled={git.uncommitted === 0}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CommitIcon />
              Commit
            </button>
            <PullSubMenu
              currentStrategy={pullStrategy}
              currentLabel={currentPullLabel}
              open={pullMenuOpen}
              onOpen={openPullMenu}
              onScheduleClose={schedulePullClose}
              onPull={handlePull}
            />
            <button
              type="button"
              onClick={() => {
                setCommitMenuOpen(false);
                onCreatePR();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
            >
              <PRIcon />
              Create PR
            </button>
            <div className="my-1 border-t border-[#2e2e2e]" />
            <button
              type="button"
              onClick={() => {
                setCommitMenuOpen(false);
                setConfirmDiscard(true);
              }}
              disabled={git.uncommitted === 0}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-red-400 transition-colors hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <UndoIcon />
              Discard all changes
            </button>
          </div>
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
    </div>
  );
}

function PullSubMenu({
  currentStrategy,
  currentLabel,
  open,
  onOpen,
  onScheduleClose,
  onPull,
}: {
  currentStrategy: PullStrategy;
  currentLabel: string;
  open: boolean;
  onOpen: () => void;
  onScheduleClose: () => void;
  onPull: (strategy: PullStrategy) => void;
}) {
  return (
    <div
      className="relative"
      onMouseEnter={onOpen}
      onMouseLeave={onScheduleClose}
    >
      <button
        type="button"
        onClick={() => onPull(currentStrategy)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
      >
        <PullIcon />
        {currentLabel}
        <span className="ml-auto flex text-[#919191]">
          <ChevronLeftIcon />
        </span>
      </button>
      {open && (
        <div
          onMouseEnter={onOpen}
          onMouseLeave={onScheduleClose}
          className="absolute right-full bottom-0 w-44 rounded-lg border border-[#2e2e2e] bg-[#242424] py-1 shadow-xl"
        >
          {PULL_STRATEGIES.map((opt) => {
            const active = currentStrategy === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onPull(opt.value)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
              >
                <span className="w-3 shrink-0">{active && <CheckIcon />}</span>
                <span className={active ? "text-[#e5e5e5]" : ""}>{opt.label}</span>
              </button>
            );
          })}
        </div>
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
      className={`flex h-5 w-5 items-center justify-center rounded text-[#919191] transition-colors hover:bg-[#333] ${
        danger ? "hover:text-red-400" : "hover:text-[#e5e5e5]"
      }`}
    >
      {children}
    </button>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative w-80 rounded-xl border border-[#2e2e2e] bg-[#1f1f1f] p-5 shadow-xl">
        <div className="text-sm font-medium text-[#e5e5e5]">{title}</div>
        <div className="mt-2 text-[12px] text-[#b3b3b3] leading-relaxed">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[#2e2e2e] bg-[#242424] px-3 py-1.5 text-xs font-medium text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-85 ${
              danger ? "bg-red-500 text-white" : "bg-white text-gray-900"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
