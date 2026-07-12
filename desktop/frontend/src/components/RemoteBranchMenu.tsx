import { useCallback, useEffect, useRef, useState } from "react";
import { useOutsideClick } from "../hooks/useOutsideClick";
import {
  remoteGitBranches,
  remoteGitCheckout,
  remoteGitCreateBranch,
  remoteGitDeleteBranch,
  remoteGitMerge,
  type RemoteBranch,
} from "./review/remoteReviewSource";
import { BranchIcon, PlusIcon, TrashIcon } from "./icons";
import { ConfirmDialog, type ConfirmVariant } from "./ui/ConfirmDialog";
import { toast } from "../toast";

// A git-merge glyph (no shared icon exists) — two branch lines converging.
function MergeIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={6} cy={6} r={3} />
      <circle cx={6} cy={18} r={3} />
      <circle cx={18} cy={9} r={3} />
      <path d="M6 9v6" />
      <path d="M18 12a6 6 0 0 1-6 6H6" />
    </svg>
  );
}

interface ConfirmState {
  title: string;
  body: string;
  confirmLabel: string;
  variant: ConfirmVariant;
  onConfirm: () => void;
}

// The footer branch control: shows the current branch and opens a menu of the
// remote project's branches. Full parity with the local branch menu: switch
// (gitCheckout), create (gitCreateBranch), delete a local branch or remove a
// stale remote-tracking ref (gitDeleteBranch), and merge a branch into the
// current one (gitMerge). Purpose-built rather than reusing BranchSwitcher, which
// is bound to local git. window.confirm is a no-op in this WKWebView, so
// destructive actions go through ConfirmDialog.
export function RemoteBranchMenu({
  peerId,
  project,
  branch,
  changed,
  onSwitched,
}: {
  peerId: string;
  project: string;
  branch: string;
  changed: number;
  onSwitched: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<RemoteBranch[]>([]);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const createRef = useRef<HTMLInputElement>(null);
  // Keep the menu open while a ConfirmDialog (a portaled Modal, so "outside" the
  // menu) is up — otherwise its backdrop/confirm click would close the menu.
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open && !confirm);

  const reload = useCallback(() => {
    let cancelled = false;
    void remoteGitBranches(peerId, project)
      .then((r) => {
        if (!cancelled) setBranches(r.branches);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [peerId, project]);

  useEffect(() => {
    if (!open) return;
    return reload();
  }, [open, reload]);

  useEffect(() => {
    if (creating) createRef.current?.focus();
  }, [creating]);

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

  const create = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await remoteGitCreateBranch(peerId, project, name);
      setCreating(false);
      setNewName("");
      setOpen(false);
      onSwitched();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the branch.");
    } finally {
      setBusy(false);
    }
  }, [peerId, project, newName, onSwitched]);

  const doDelete = (b: RemoteBranch) => {
    const label = b.remote ? `${b.remote}/${b.name}` : b.name;
    setConfirm({
      title: b.remote ? "Remove remote-tracking branch" : "Delete branch",
      body: b.remote
        ? `Remove the stale remote-tracking ref "${label}"? This only clears it locally on the other Mac.`
        : `Delete "${b.name}" on the other Mac? This removes it even if it has unmerged commits.`,
      confirmLabel: b.remote ? "Remove" : "Delete",
      variant: "destructive",
      onConfirm: () => {
        setBusy(true);
        void remoteGitDeleteBranch(peerId, project, b.name, b.remote)
          .then(() => {
            toast.success(b.remote ? "Removed tracking ref" : `Deleted "${b.name}"`);
            reload();
          })
          .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't delete the branch."))
          .finally(() => setBusy(false));
      },
    });
  };

  const doMerge = (b: RemoteBranch) => {
    setConfirm({
      title: "Merge branch",
      body: `Merge "${b.name}" into "${branch}" on the other Mac?`,
      confirmLabel: "Merge",
      variant: "default",
      onConfirm: () => {
        setBusy(true);
        void remoteGitMerge(peerId, project, b.name)
          .then(() => {
            toast.success(`Merged "${b.name}" into "${branch}"`);
            setOpen(false);
            onSwitched();
          })
          .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't merge — if there are conflicts, resolve them on that Mac directly."))
          .finally(() => setBusy(false));
      },
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Switch branch"
        className={`flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
          open
            ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
      >
        <BranchIcon size={12} />
        <span className="max-w-32 truncate font-mono">
          {branch || "detached"}
        </span>
        {changed > 0 && (
          <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-blue)]" />
        )}
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-[80] mb-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-xl">
          {creating ? (
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <input
                ref={createRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void create();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
                placeholder="new-branch-name"
                disabled={busy}
                className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-1 font-mono text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]"
              />
              <button
                onClick={() => void create()}
                disabled={busy || !newName.trim()}
                className="shrink-0 rounded bg-[var(--text-primary)] px-2 py-1 text-[11px] font-medium text-[var(--bg-primary)] disabled:opacity-40"
              >
                Create
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              <PlusIcon />
              <span>New branch</span>
            </button>
          )}
          <div className="my-1 h-px bg-[var(--border)]" />
          {branches.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-[var(--text-muted)]">
              No branches.
            </p>
          ) : (
            branches.map((b) => {
              const current = b.name === branch && !b.remote;
              return (
                <div
                  key={`${b.remote ?? "local"}:${b.name}`}
                  className="group flex items-center gap-1 pr-1.5 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <button
                    onClick={() => void checkout(b)}
                    disabled={busy}
                    className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-[12px] disabled:opacity-50 ${
                      current
                        ? "text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)]"
                    }`}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: current
                          ? "var(--accent-green)"
                          : "transparent",
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    {b.remote && (
                      <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                        {b.remote}
                      </span>
                    )}
                  </button>
                  {!current && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {!b.remote && (
                        <button
                          onClick={() => doMerge(b)}
                          disabled={busy}
                          title={`Merge into ${branch}`}
                          aria-label={`Merge ${b.name} into ${branch}`}
                          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] disabled:opacity-40"
                        >
                          <MergeIcon />
                        </button>
                      )}
                      <button
                        onClick={() => doDelete(b)}
                        disabled={busy}
                        title={b.remote ? "Remove tracking ref" : "Delete branch"}
                        aria-label={`Delete ${b.name}`}
                        className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--accent-red)]/10 hover:text-[var(--accent-red)] disabled:opacity-40"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title}
        body={confirm?.body ?? ""}
        confirmLabel={confirm?.confirmLabel}
        variant={confirm?.variant}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.onConfirm();
          setConfirm(null);
        }}
      />
    </div>
  );
}
