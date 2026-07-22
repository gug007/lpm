import { useState } from "react";
import { ArrowRight, RefreshCw, Trash2, X } from "lucide-react";
import { Modal } from "../ui/Modal";
import { PeerSyncRun } from "../../../bridge/commands";

export interface SyncItem {
  kind: "project" | "global" | "template";
  name: string;
  direction: "toLocal" | "toRemote";
  localMtime: number;
  remoteMtime: number;
  // Changed on both Macs since they last matched; the newer change wins.
  conflict?: boolean;
  // Removes the file on the destination side rather than copying content.
  deleted?: boolean;
}

export interface SyncRunResult {
  applied: number;
  pushed: number;
  errors: string[];
  backupPath?: string;
}

const KIND_ORDER: { kind: SyncItem["kind"]; label: string }[] = [
  { kind: "project", label: "Projects" },
  { kind: "global", label: "Global" },
  { kind: "template", label: "Templates" },
];

function DirectionArrow({
  direction,
  peerName,
}: {
  direction: SyncItem["direction"];
  peerName: string;
}) {
  const from = direction === "toRemote" ? "This Mac" : peerName;
  const to = direction === "toRemote" ? peerName : "This Mac";
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--text-muted)]">
      <span className="max-w-[90px] truncate">{from}</span>
      <ArrowRight size={11} className="shrink-0 text-[var(--accent-cyan)]" />
      <span className="max-w-[90px] truncate">{to}</span>
    </span>
  );
}

function RemoveLabel({
  direction,
  peerName,
}: {
  direction: SyncItem["direction"];
  peerName: string;
}) {
  const where = direction === "toRemote" ? peerName : "This Mac";
  return (
    <span
      className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--accent-red)]"
      title={`This file was deleted and will be removed on ${where}. A backup is kept.`}
    >
      <Trash2 size={11} className="shrink-0" />
      <span className="max-w-[120px] truncate">Removed on {where}</span>
    </span>
  );
}

function ConflictBadge() {
  return (
    <span
      title="Changed on both Macs — the newer change wins, and a backup is kept."
      className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        color: "var(--accent-amber)",
        backgroundColor: "color-mix(in srgb, var(--accent-amber) 14%, transparent)",
      }}
    >
      Both changed
    </span>
  );
}

export function SyncPreviewModal({
  open,
  peerName,
  slug,
  items,
  onClose,
  onSynced,
}: {
  open: boolean;
  peerName: string;
  slug: string;
  items: SyncItem[];
  onClose: () => void;
  onSynced: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (running) return;
    setResult(null);
    setError(null);
    onClose();
  };

  const confirm = async () => {
    setRunning(true);
    setError(null);
    try {
      const r = (await PeerSyncRun(slug, items)) as SyncRunResult;
      setResult(r);
      onSynced();
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  };

  const grouped = KIND_ORDER.map((g) => ({
    ...g,
    rows: items.filter((i) => i.kind === g.kind),
  })).filter((g) => g.rows.length > 0);

  return (
    <Modal
      open={open}
      onClose={close}
      backdrop
      zIndexClassName="z-[60]"
      contentClassName="flex max-h-[85vh] w-[min(560px,92vw)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex shrink-0 items-start gap-3 px-6 pb-1 pt-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] ring-1 ring-inset ring-[var(--accent-cyan)]/20">
          <RefreshCw size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
            Sync config with{" "}
            <span className="font-mono text-[var(--text-secondary)]">{peerName}</span>
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
            The newer copy of each item wins, and when an item changed on both Macs the newer change
            is kept. A full backup of each Mac's config is taken first.
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="-mr-1 -mt-1 ml-auto shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-5">
        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
              <div className="flex-1">
                <p className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">
                  {result.applied}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">applied to this Mac</p>
              </div>
              <div className="flex-1">
                <p className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">
                  {result.pushed}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">pushed to {peerName}</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-xl border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/5 px-4 py-3">
                <p className="mb-1 text-[12px] font-medium text-[var(--accent-red)]">
                  {result.errors.length} item{result.errors.length === 1 ? "" : "s"} failed
                </p>
                <ul className="space-y-0.5 text-[11px] text-[var(--text-muted)]">
                  {result.errors.map((e, i) => (
                    <li key={i} className="truncate">
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.applied > 0 && result.backupPath && (
              <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                A backup of this Mac's previous config was saved to{" "}
                <span className="break-all font-mono text-[var(--text-secondary)]">
                  {result.backupPath}
                </span>
              </p>
            )}
          </div>
        ) : (
          grouped.map((g) => (
            <div key={g.kind}>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                {g.label}
              </p>
              <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
                {g.rows.map((it) => (
                  <div
                    key={`${it.kind}:${it.name}`}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate text-[13px] text-[var(--text-primary)]">
                        {it.name}
                      </span>
                      {it.conflict && <ConflictBadge />}
                    </div>
                    {it.deleted ? (
                      <RemoveLabel direction={it.direction} peerName={peerName} />
                    ) : (
                      <DirectionArrow direction={it.direction} peerName={peerName} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        {error && <p className="text-[12px] text-[var(--accent-red)]">{error}</p>}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
        <button
          type="button"
          onClick={close}
          disabled={running}
          className="rounded-lg px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
        >
          {result ? "Done" : "Cancel"}
        </button>
        {!result && (
          <button
            type="button"
            onClick={confirm}
            disabled={running || items.length === 0}
            className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-[13px] font-medium text-[var(--bg-primary)] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {running ? "Syncing…" : `Sync ${items.length} item${items.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
