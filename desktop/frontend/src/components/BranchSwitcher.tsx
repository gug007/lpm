import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GitStatus as ApiGitStatus,
  ListBranches,
  CheckoutBranch,
  CreateBranch,
  SyncBranch,
} from "../../wailsjs/go/main/App";
import { main } from "../../wailsjs/go/models";

type GitStatus = main.GitStatus;

export function BranchSwitcher({ projectPath, onError }: {
  projectPath: string;
  onError: (msg: string) => void;
}) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    try {
      const [s, b] = await Promise.all([
        ApiGitStatus(projectPath),
        ListBranches(projectPath).catch(() => [] as string[]),
      ]);
      setStatus(s);
      setBranches(b);
    } catch {
      // Component hides itself when status.isGitRepo is false.
    }
  }, [projectPath]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); setCreating(false); }
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  useEffect(() => {
    if (open && !creating) searchRef.current?.focus();
    if (creating) createRef.current?.focus();
  }, [open, creating]);

  const filtered = useMemo(() => {
    if (!query) return branches;
    const q = query.toLowerCase();
    return branches.filter((b) => b.toLowerCase().includes(q));
  }, [branches, query]);

  if (!status?.isGitRepo) return null;

  const checkout = async (branch: string) => {
    if (busy || branch === status.branch) { setOpen(false); return; }
    setBusy(true);
    try {
      await CheckoutBranch(projectPath, branch);
      await refresh();
      setOpen(false);
      setQuery("");
    } catch (err) {
      onError(`Checkout ${branch}: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await CreateBranch(projectPath, name);
      await refresh();
      setOpen(false);
      setCreating(false);
      setNewName("");
      setQuery("");
    } catch (err) {
      onError(`Create ${name}: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await SyncBranch(projectPath);
      await refresh();
    } catch (err) {
      onError(`Sync: ${err}`);
    } finally {
      setBusy(false);
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
          className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <SyncIcon spinning={busy} />
          {status.behind > 0 && <span>{status.behind}↓</span>}
          {status.ahead > 0 && <span>{status.ahead}↑</span>}
        </button>
      )}
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          title={busy ? "Switching branch…" : "Switch branch"}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <BranchIcon />
          <span className="max-w-32 truncate">{status.branch || "detached"}</span>
          {status.uncommitted > 0 && (
            <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" title={`${status.uncommitted} uncommitted file${status.uncommitted === 1 ? "" : "s"}`} />
          )}
          <ChevronDown />
        </button>

      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-1 w-72 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg">
          <div className="border-b border-[var(--border)] p-2">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search branches"
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
              const isCurrent = b === status.branch;
              return (
                <button
                  key={b}
                  onClick={() => checkout(b)}
                  disabled={busy}
                  className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
                >
                  <BranchIcon />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate ${isCurrent ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{b}</span>
                    {isCurrent && status.uncommitted > 0 && (
                      <span className="text-[10px] text-[var(--text-muted)]">
                        Uncommitted: {status.uncommitted} file{status.uncommitted === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                  {isCurrent && <CheckIcon />}
                </button>
              );
            })}
          </div>
          <div className="border-t border-[var(--border)]">
            {creating ? (
              <div className="flex items-center gap-2 p-2">
                <input
                  ref={createRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") create();
                    if (e.key === "Escape") { setCreating(false); setNewName(""); }
                  }}
                  placeholder="new-branch-name"
                  disabled={busy}
                  className="flex-1 rounded-md bg-[var(--bg-hover)] px-2 py-1 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none disabled:opacity-50"
                />
                <button
                  onClick={create}
                  disabled={busy || !newName.trim()}
                  className="rounded-md bg-[var(--text-primary)] px-2 py-1 text-[11px] font-medium text-[var(--bg-primary)] hover:opacity-90 disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                disabled={busy}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
              >
                <PlusIcon />
                <span>Create and checkout new branch…</span>
              </button>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function BranchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
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

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
