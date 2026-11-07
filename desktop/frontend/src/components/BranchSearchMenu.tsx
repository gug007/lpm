import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import { main } from "../../bridge/models";
import { useBranchSearch } from "../hooks/useBranchSearch";
import { useConfirmFlashFor } from "../hooks/useConfirmFlash";
import { BranchRow } from "./BranchRow";
import { enterHint } from "../shortcutHints";
import { branchKeyAction, branchKeyHints } from "./branchKeys";
import { branchSearchRows, type BranchEntry } from "./branchSearchRows";
import { branchKey, orderBranches } from "./branchUtils";

interface BranchSearchMenuProps {
  projectPath: string;
  branches: main.Branch[];
  current: string;
  uncommitted: number;
  busy: boolean;
  pruning: boolean;
  onCheckout: (branch: main.Branch) => void;
  onCreate: (name: string) => void;
  // Resolves whether the rename went through.
  onRename: (branch: main.Branch, newName: string) => Promise<boolean>;
  onDelete: (branch: main.Branch) => void;
  onRemoveRemote: (branch: main.Branch) => void;
  // Resolves whether the copy went through.
  onCopyName: (name: string) => Promise<boolean>;
  onNewBranch: (prefill: string) => void;
}

const CAPTION = "text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]";

export function BranchSearchMenu({
  projectPath,
  branches,
  current,
  uncommitted,
  busy,
  pruning,
  onCheckout,
  onCreate,
  onRename,
  onDelete,
  onRemoveRemote,
  onCopyName,
  onNewBranch,
}: BranchSearchMenuProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [copiedKey, flashCopied] = useConfirmFlashFor<string>();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchResults = useBranchSearch(projectPath, query, true);

  const rows = useMemo(
    () => branchSearchRows(query, orderBranches(branches, query, searchResults, current), branches),
    [branches, query, searchResults, current],
  );
  const { entries, local, remote } = rows;

  useEffect(() => {
    setActiveIndex(rows.initialIndex);
  }, [query, rows.initialIndex]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const clampedIndex = Math.min(activeIndex, Math.max(entries.length - 1, 0));
  const active: BranchEntry | undefined = entries[clampedIndex];
  const activeBranch = active?.kind === "branch" ? active.branch : null;
  const activeBranchRef = useRef(activeBranch);
  activeBranchRef.current = activeBranch;

  // A Copy menu item is only enabled with a selection, unless the page claims
  // the copy, so ⌘C with nothing selected can still copy the branch name.
  useEffect(() => {
    const input = searchRef.current;
    if (!input) return;
    const claim = (e: Event) => {
      if (input.selectionStart === input.selectionEnd && activeBranchRef.current) e.preventDefault();
    };
    input.addEventListener("beforecopy", claim);
    return () => input.removeEventListener("beforecopy", claim);
  }, []);

  const moveActive = (delta: number) => {
    if (entries.length === 0) return;
    const next = Math.max(0, Math.min(entries.length - 1, clampedIndex + delta));
    setActiveIndex(next);
    listRef.current
      ?.querySelector(`[data-branch-index="${next}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const activate = (entry: BranchEntry | undefined) => {
    if (!entry) return;
    if (entry.kind === "create") onCreate(entry.slug);
    else onCheckout(entry.branch);
  };

  const startRename = (b: main.Branch) => {
    setRenamingKey(branchKey(b));
    setRenameValue(b.name);
  };

  const endRename = () => {
    setRenamingKey(null);
    searchRef.current?.focus();
  };

  const submitRename = async (b: main.Branch) => {
    const newName = renameValue.trim();
    if (!newName || newName === b.name) {
      endRename();
      return;
    }
    if (await onRename(b, newName)) endRename();
  };

  const copyName = async (b: main.Branch) => {
    if (await onCopyName(b.name)) flashCopied(branchKey(b));
  };

  const remove = (b: main.Branch) => {
    if (b.remote) onRemoveRemote(b);
    else if (b.name !== current) onDelete(b);
  };

  const hasSelection = (input: HTMLInputElement) => input.selectionStart !== input.selectionEnd;

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      activate(active);
      return;
    }
    const action = branchKeyAction(e);
    if (!action || !activeBranch) return;
    if (action === "copy") {
      if (hasSelection(e.currentTarget)) return;
      e.preventDefault();
      void copyName(activeBranch);
    } else if (action === "rename") {
      e.preventDefault();
      if (!activeBranch.remote) startRename(activeBranch);
    } else {
      e.preventDefault();
      remove(activeBranch);
    }
  };

  const firstBranchIndex = entries[0]?.kind === "create" ? 1 : 0;

  const renderBranch = (b: main.Branch, index: number) => {
    const key = branchKey(b);
    return (
      <BranchRow
        key={key}
        branch={b}
        index={index}
        active={index === clampedIndex}
        isCurrent={b.name === current}
        uncommitted={uncommitted}
        busy={busy}
        renaming={renamingKey === key}
        copied={copiedKey === key}
        renameValue={renameValue}
        onRenameChange={setRenameValue}
        onRenameSubmit={() => submitRename(b)}
        onRenameCancel={() => setRenamingKey(null)}
        onCheckout={() => onCheckout(b)}
        onCopy={() => void copyName(b)}
        onStartRename={() => startRename(b)}
        onDelete={() => onDelete(b)}
        onRemoveRemote={() => onRemoveRemote(b)}
      />
    );
  };

  const syncing = pruning && (
    <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
      <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-[var(--text-muted)]" />
      Syncing…
    </span>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
      <div className="border-b border-[var(--border)] p-2">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
          onCopy={(e) => {
            if (hasSelection(e.currentTarget) || !activeBranch) return;
            e.preventDefault();
            void copyName(activeBranch);
          }}
          placeholder="Search or create a branch"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full rounded-lg bg-transparent px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
      </div>
      <div ref={listRef} className="max-h-[360px] overflow-y-auto py-1.5">
        {entries[0]?.kind === "create" && (
          <button
            data-branch-index={0}
            onClick={() => activate(entries[0])}
            disabled={busy}
            className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50 ${
              clampedIndex === 0 ? "bg-[var(--bg-hover)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
            }`}
          >
            <Plus size={14} strokeWidth={2} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              Create branch{" "}
              <code className="rounded bg-[var(--bg-active)] px-1 font-mono text-[12px] text-[var(--text-primary)]">
                {entries[0].slug}
              </code>{" "}
              from <span className="font-mono">{current || "HEAD"}</span>
            </span>
            <kbd className="shrink-0 text-[11px] text-[var(--text-muted)]">{enterHint()}</kbd>
          </button>
        )}
        {local.length > 0 && (
          <div className="flex items-center px-4 pb-1.5 pt-2">
            <span className={CAPTION}>Local</span>
            {syncing}
          </div>
        )}
        {local.map((b, i) => renderBranch(b, firstBranchIndex + i))}
        {remote.length > 0 && (
          <div className="flex items-center px-4 pb-1.5 pt-2">
            <span className={CAPTION}>Remote</span>
            {local.length === 0 && syncing}
          </div>
        )}
        {remote.map((b, i) => renderBranch(b, firstBranchIndex + local.length + i))}
        {entries.length === 0 && (
          <div className="px-4 py-3 text-[13px] text-[var(--text-muted)]">No matches</div>
        )}
      </div>
      <div className="flex items-center gap-3 border-t border-[var(--border)] pr-4">
        <button
          onClick={() => onNewBranch(query.trim())}
          disabled={busy}
          className="flex shrink-0 items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <Plus size={14} strokeWidth={2} />
          <span>New branch…</span>
        </button>
        <span className="ml-auto flex min-w-0 flex-wrap justify-end gap-x-2 text-[10px] text-[var(--text-muted)]">
          {branchKeyHints().map((h, i) => (
            <span key={h.label} className="whitespace-nowrap">
              {i > 0 && <span className="mr-2">·</span>}
              <span className="text-[var(--text-secondary)]">{h.keys}</span> {h.label}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
