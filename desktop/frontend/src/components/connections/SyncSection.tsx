import { RefreshCw } from "lucide-react";
import { PeerSetAutoSync } from "../../../bridge/commands";
import type { PeerClient } from "../../peer/usePeerState";
import { autoSyncHint, canSyncNow, lastSyncedText, syncPill, usePeerSync } from "../../peer/usePeerSync";
import { GroupHeader, Group } from "./GroupedList";
import { Toggle } from "./Toggle";
import { SyncPreviewModal } from "./SyncPreviewModal";
import { MACHINE as M } from "../../machineWords";

// Config sync with Linux hosts. A computer in the one list keeps its sync in its
// own row; hosts sit in a list of their own, so their sync does too.
export function SyncSection({ peers }: { peers: PeerClient[] }) {
  const { diffs, busy, preview, syncNow, closePreview, refreshAll } = usePeerSync(peers);

  return (
    <section className="mt-8">
      <GroupHeader>Config sync</GroupHeader>
      <Group>
        <p className="px-4 py-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
          Mirror projects, global config, and settings between {M.thisMachine} and each host. The newer copy
          of each item wins, and a change on both keeps the newer one; local paths, accounts, and window
          layout stay per-machine.
        </p>
        {peers.map((p) => {
          const diff = diffs[p.slug];
          const pill = syncPill(p, diff);
          const hint = autoSyncHint(p);
          return (
            <div key={p.slug} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {p.alias || p.host}
                    </p>
                    <span
                      title={pill.title}
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        color: pill.color,
                        backgroundColor: `color-mix(in srgb, ${pill.color} 14%, transparent)`,
                      }}
                    >
                      {pill.text}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-[var(--text-muted)]">{lastSyncedText(p)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void syncNow(p)}
                  disabled={!canSyncNow(p, diff, busy)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-active)] disabled:cursor-default disabled:opacity-40"
                >
                  <RefreshCw size={13} className={busy === p.slug ? "animate-spin" : ""} />
                  Sync now
                </button>
              </div>
              <div className="mt-3 flex items-start gap-3 border-t border-[var(--border)] pt-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">
                    Keep in sync automatically
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    Changes on either side sync shortly after they happen. If both change the same item, the
                    newer change wins and a backup is kept.
                  </p>
                  {hint && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{hint}</p>}
                </div>
                <Toggle
                  enabled={!!p.autoSync}
                  ariaLabel={`Keep config in sync with ${p.alias || p.host} automatically`}
                  onChange={(v) => void PeerSetAutoSync(p.slug, v)}
                />
              </div>
            </div>
          );
        })}
      </Group>

      <SyncPreviewModal
        open={preview !== null}
        slug={preview?.slug ?? ""}
        peerName={preview?.name ?? ""}
        items={preview?.items ?? []}
        onClose={closePreview}
        onSynced={() => void refreshAll()}
      />
    </section>
  );
}
