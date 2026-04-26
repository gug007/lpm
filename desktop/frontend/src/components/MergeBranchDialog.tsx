import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "./ui/Modal";
import { GitMerge } from "../../wailsjs/go/main/App";
import { main } from "../../wailsjs/go/models";
import { useBranchSearch } from "../hooks/useBranchSearch";
import { branchKey, branchMatches, RemoteBadge } from "./branchUtils";
import { BranchIcon, CloudBranchIcon, XIcon } from "./icons";
import { relativeTime } from "../relativeTime";

interface MergeBranchDialogProps {
  open: boolean;
  projectPath: string;
  currentBranch: string;
  branches: main.Branch[];
  onClose: () => void;
  onMerged: () => void;
}

export function MergeBranchDialog({
  open,
  projectPath,
  currentBranch,
  branches,
  onClose,
  onMerged,
}: MergeBranchDialogProps) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const excludeCurrent = useMemo(
    () => (b: main.Branch) => b.name !== currentBranch || !!b.remote,
    [currentBranch],
  );

  const searchResults = useBranchSearch(projectPath, query, open, excludeCurrent);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setBusy(null);
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const filtered = useMemo(() => {
    const base = !query
      ? branches.filter(excludeCurrent)
      : searchResults !== null
        ? searchResults
        : branches.filter((b) => excludeCurrent(b) && branchMatches(b, query));
    const rank = (b: main.Branch) => (b.remote ? 1 : 0);
    return [...base].sort((a, b) => rank(a) - rank(b));
  }, [branches, query, searchResults, excludeCurrent]);

  const merge = async (branch: main.Branch) => {
    if (busy) return;
    const ref = branchKey(branch);
    setBusy(ref);
    try {
      await GitMerge(projectPath, ref);
      toast.success(`Merged ${branch.name} into ${currentBranch}`);
      onMerged();
      onClose();
    } catch (err) {
      toast.error(`Merge failed: ${err}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      zIndexClassName="z-[60]"
      contentClassName="w-[520px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Merge branch
          </h3>
          <span className="text-[11px] text-[var(--text-muted)]">
            into <span className="font-mono text-[var(--text-secondary)]">{currentBranch || "current branch"}</span>
          </span>
        </div>
        <button
          onClick={onClose}
          disabled={!!busy}
          aria-label="Close"
          className="rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <XIcon />
        </button>
      </div>

      <div className="border-b border-[var(--border)] p-2">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search branches to merge"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={!!busy}
          className="w-full rounded-lg bg-transparent px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none disabled:opacity-50"
        />
      </div>

      <div className="max-h-[360px] overflow-y-auto py-1.5">
        {filtered.length === 0 && (
          <div className="px-4 py-3 text-[13px] text-[var(--text-muted)]">
            {query ? "No matches" : "No other branches"}
          </div>
        )}
        {filtered.map((b) => {
          const key = branchKey(b);
          const age = relativeTime(b.committerDate);
          const isBusy = busy === key;
          return (
            <button
              key={key}
              onClick={() => merge(b)}
              disabled={!!busy}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {b.remote ? <CloudBranchIcon size={14} /> : <BranchIcon size={14} />}
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate">{b.name}</span>
                {b.remote && <RemoteBadge remote={b.remote} />}
              </span>
              {isBusy ? (
                <span className="text-[11px] text-[var(--text-muted)]">Merging…</span>
              ) : (
                age && <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{age}</span>
              )}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
