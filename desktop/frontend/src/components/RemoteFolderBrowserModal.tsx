import { useCallback, useEffect, useState } from "react";
import { Modal } from "./ui/Modal";
import { ChevronRightIcon, FolderIcon, XIcon } from "./icons";
import { PeerInvoke } from "../../bridge/commands";

interface DirListing {
  path: string;
  parent: string | null;
  dirs: string[];
}

// Browse a paired Mac's filesystem to pick a folder there. Lists directories a
// level at a time over the peer proxy (`list_dirs`), starting at the host's
// $HOME. Used by the remote add-project flow — both to adopt an existing folder
// as a project and to choose a clone destination.
export function RemoteFolderBrowserModal({
  open,
  slug,
  alias,
  title,
  confirmLabel,
  onChoose,
  onClose,
}: {
  open: boolean;
  slug: string;
  alias: string;
  title?: string;
  confirmLabel?: string;
  onChoose: (hostPath: string) => void;
  onClose: () => void;
}) {
  const [listing, setListing] = useState<DirListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (path: string) => {
      setLoading(true);
      setError("");
      try {
        const result = (await PeerInvoke(slug, "list_dirs", { path })) as DirListing;
        setListing(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err ?? "Couldn't open folder"));
      } finally {
        setLoading(false);
      }
    },
    [slug],
  );

  useEffect(() => {
    if (!open) {
      setListing(null);
      setError("");
      return;
    }
    void load("");
  }, [open, load]);

  const current = listing?.path ?? "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndexClassName="z-[70]"
      contentClassName="flex max-h-[70vh] w-[460px] flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-xl"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {title ?? `Choose a folder on ${alias}`}
          </h3>
          <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]" title={current}>
            {current || "…"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <XIcon />
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-[var(--danger,#f87171)]/40 bg-[var(--danger,#f87171)]/10 px-3 py-2 text-[12px] leading-relaxed text-[var(--danger,#f87171)]">
          {error}
        </div>
      )}

      <div className="mt-4 min-h-[140px] flex-1 overflow-y-auto rounded-lg border border-[var(--border)]">
        {listing?.parent != null && (
          <button
            type="button"
            onClick={() => load(listing.parent as string)}
            disabled={loading}
            className="flex w-full items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
          >
            <span className="text-[var(--text-muted)]">..</span>
            <span className="text-[11px] text-[var(--text-muted)]">Parent folder</span>
          </button>
        )}
        {loading && !listing ? (
          <div className="px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">Loading…</div>
        ) : listing && listing.dirs.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">
            No subfolders here.
          </div>
        ) : (
          listing?.dirs.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => load(`${current.replace(/\/$/, "")}/${name}`)}
              disabled={loading}
              className="group flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              <span className="shrink-0 text-[#facc15] [&_svg]:h-4 [&_svg]:w-4">
                <FolderIcon />
              </span>
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <span className="shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
                <ChevronRightIcon />
              </span>
            </button>
          ))
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => current && onChoose(current)}
          disabled={loading || !current}
          className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-40"
        >
          {confirmLabel ?? "Choose this folder"}
        </button>
      </div>
    </Modal>
  );
}
