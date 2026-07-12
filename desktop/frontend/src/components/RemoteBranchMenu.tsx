import { useCallback, useEffect, useState } from "react";
import { useOutsideClick } from "../hooks/useOutsideClick";
import {
  remoteGitBranches,
  remoteGitCheckout,
  type RemoteBranch,
} from "./review/remoteReviewSource";
import { BranchIcon, ChevronDownIcon } from "./icons";
import { toast } from "../toast";

// The footer branch control: shows the current branch and opens a menu of the
// remote project's branches, switching via gitCheckout. Mirrors the local branch
// dropdown's role without reusing BranchSwitcher (which is bound to local git);
// create/delete/prune are out of scope (branches are managed on the other Mac).
export function RemoteBranchMenu({
  peerId,
  project,
  branch,
  onSwitched,
}: {
  peerId: string;
  project: string;
  branch: string;
  onSwitched: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<RemoteBranch[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void remoteGitBranches(peerId, project)
      .then((r) => {
        if (!cancelled) setBranches(r.branches);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, peerId, project]);

  const checkout = useCallback(
    async (b: RemoteBranch) => {
      if (b.name === branch && !b.remote) {
        setOpen(false);
        return;
      }
      setBusy(true);
      try {
        await remoteGitCheckout(peerId, project, b.name, b.remote);
        setOpen(false);
        onSwitched();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't switch branch.");
      } finally {
        setBusy(false);
      }
    },
    [peerId, project, branch, onSwitched],
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
      >
        <BranchIcon />
        <span className="max-w-[10rem] truncate">{branch || "—"}</span>
        <span className="text-[var(--text-muted)]">
          <ChevronDownIcon />
        </span>
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-[80] mb-1 max-h-72 w-60 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-xl">
          {branches.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-[var(--text-muted)]">No branches.</p>
          ) : (
            branches.map((b) => {
              const current = b.name === branch && !b.remote;
              return (
                <button
                  key={`${b.remote ?? "local"}:${b.name}`}
                  onClick={() => void checkout(b)}
                  disabled={busy}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50 ${
                    current ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: current ? "var(--accent-green)" : "transparent" }}
                  />
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  {b.remote && <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{b.remote}</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
