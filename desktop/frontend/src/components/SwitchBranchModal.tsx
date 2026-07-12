import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "../toast";
import { Modal } from "./ui/Modal";
import { CheckoutBranch } from "../../bridge/commands";
import { main } from "../../bridge/models";
import type { useGitStatus } from "../hooks/useGitStatus";
import { useBranchSearch } from "../hooks/useBranchSearch";
import { branchKey, orderBranches, RemoteBadge } from "./branchUtils";
import { BranchIcon, CheckIcon, CloudBranchIcon, XIcon } from "./icons";
import { relativeTime } from "../relativeTime";

interface SwitchBranchModalProps {
  open: boolean;
  projectPath: string;
  gitState: ReturnType<typeof useGitStatus>;
  onClose: () => void;
}

export function SwitchBranchModal({ open, projectPath, gitState, onClose }: SwitchBranchModalProps) {
  const { status, branches, refresh } = gitState;
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const searchResults = useBranchSearch(projectPath, query, open);
  const searchRef = useRef<HTMLInputElement>(null);
  const current = status?.branch ?? "";

  // The host (ProjectGitModals) re-runs useGitStatus on every open — its path
  // transitions ""→path each time the modal opens — so the branch list is
  // already fresh and needs no refresh() here.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  const filtered = useMemo(
    () => orderBranches(branches, query, searchResults, current),
    [branches, query, searchResults, current],
  );

  const checkout = async (b: main.Branch) => {
    if (busy) return;
    if (b.name === current && !b.remote) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await CheckoutBranch(projectPath, b.name, b.remote ?? "");
      await refresh();
      toast.success(`Switched to ${b.name}`);
      onClose();
    } catch (err) {
      toast.error(`Checkout ${b.name}: ${err}`);
    } finally {
      setBusy(false);
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
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Switch branch</h3>
        <button
          onClick={onClose}
          disabled={busy}
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
          placeholder="Search branches"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full rounded-lg bg-transparent px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
      </div>
      <div className="max-h-[360px] overflow-y-auto py-1.5">
        {filtered.length === 0 && (
          <div className="px-4 py-3 text-[13px] text-[var(--text-muted)]">No matches</div>
        )}
        {filtered.map((b) => {
          const isCurrent = b.name === current && !b.remote;
          const age = relativeTime(b.committerDate);
          return (
            <button
              key={branchKey(b)}
              onClick={() => checkout(b)}
              disabled={busy}
              title={b.remote ? `Create local tracking branch from ${b.remote}/${b.name}` : undefined}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50 ${
                isCurrent ? "text-[var(--accent-blue)]" : "text-[var(--text-secondary)]"
              }`}
            >
              {b.remote ? <CloudBranchIcon size={14} /> : <BranchIcon size={14} />}
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate font-mono">{b.name}</span>
                {b.remote && <RemoteBadge remote={b.remote} />}
              </span>
              {isCurrent && <CheckIcon />}
              {age && <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{age}</span>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
