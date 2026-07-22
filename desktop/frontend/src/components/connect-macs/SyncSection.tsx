import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PeerSyncStatus } from "../../../bridge/commands";
import { EventsOn } from "../../../bridge/runtime";
import { subscribePeerGlobalEvent } from "../../peer/route";
import type { PeerClient } from "../../peer/usePeerState";
import { relativeTime } from "../../relativeTime";
import { rowProps } from "../../settings-registry";
import { GroupHeader, Group, Row } from "./GroupedList";
import { SyncPreviewModal, type SyncItem } from "./SyncPreviewModal";

interface DiffState {
  loading: boolean;
  items: SyncItem[] | null;
  error: string | null;
}

interface Pill {
  text: string;
  color: string;
  title?: string;
}

function pillFor(peer: PeerClient, diff: DiffState | undefined): Pill {
  if (!peer.enabled) return { text: "Off", color: "var(--text-muted)" };
  if (!peer.connected) return { text: "Offline", color: "var(--text-muted)" };
  if (!peer.supportsSync)
    return {
      text: "Update needed",
      color: "var(--accent-amber)",
      title: "The other Mac needs to update lpm to sync config.",
    };
  if (!diff || diff.loading) return { text: "Checking…", color: "var(--text-muted)" };
  if (diff.error) return { text: "Error", color: "var(--accent-red)", title: diff.error };
  const n = diff.items?.length ?? 0;
  if (n === 0) return { text: "In sync", color: "var(--accent-green)" };
  return { text: `${n} item${n === 1 ? "" : "s"} differ`, color: "var(--accent-amber)" };
}

export function SyncSection({ peers }: { peers: PeerClient[] }) {
  const [diffs, setDiffs] = useState<Record<string, DiffState>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ slug: string; name: string; items: SyncItem[] } | null>(
    null,
  );

  // Latest peer list, read by event handlers without re-subscribing on each change.
  const peersRef = useRef(peers);
  peersRef.current = peers;

  const load = useCallback(async (slug: string): Promise<SyncItem[] | null> => {
    setDiffs((d) => ({ ...d, [slug]: { loading: true, items: d[slug]?.items ?? null, error: null } }));
    try {
      const res = (await PeerSyncStatus(slug)) as { items: SyncItem[] };
      const items = res?.items ?? [];
      setDiffs((d) => ({ ...d, [slug]: { loading: false, items, error: null } }));
      return items;
    } catch (err) {
      setDiffs((d) => ({ ...d, [slug]: { loading: false, items: null, error: String(err) } }));
      return null;
    }
  }, []);

  const refreshAll = useCallback(() => {
    for (const p of peersRef.current) {
      if (p.enabled && p.connected && p.supportsSync) void load(p.slug);
    }
  }, [load]);

  // Compute diffs for peers that just became syncable; drop state for peers gone.
  const syncableKey = peers
    .filter((p) => p.enabled && p.connected && p.supportsSync)
    .map((p) => p.slug)
    .join(",");
  useEffect(() => {
    const present = new Set(peers.map((p) => p.slug));
    setDiffs((d) => {
      const next: Record<string, DiffState> = {};
      for (const [slug, state] of Object.entries(d)) if (present.has(slug)) next[slug] = state;
      return next;
    });
    for (const p of peers) {
      if (p.enabled && p.connected && p.supportsSync && !diffs[p.slug]) void load(p.slug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncableKey]);

  // Recompute after any config change — local edits, peer-forwarded host edits,
  // and each completed sync (which emits projects-changed locally).
  useEffect(() => {
    const debounced = (() => {
      let t: ReturnType<typeof setTimeout> | null = null;
      return () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => void refreshAll(), 400);
      };
    })();
    const offs = [
      EventsOn("projects-changed", debounced),
      EventsOn("templates-changed", debounced),
      subscribePeerGlobalEvent("projects-changed", debounced),
      subscribePeerGlobalEvent("templates-changed", debounced),
    ];
    return () => offs.forEach((off) => off());
  }, [refreshAll]);

  const syncNow = useCallback(
    async (peer: PeerClient) => {
      setBusy(peer.slug);
      try {
        const items = await load(peer.slug);
        if (items && items.length > 0) {
          setPreview({ slug: peer.slug, name: peer.alias || peer.host, items });
        }
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  return (
    <section className="mt-8" data-settings-row={rowProps("connect-macs.sync").id}>
      <GroupHeader>Config sync</GroupHeader>
      <Group>
        <p className="px-4 py-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
          Mirror projects, global config, and settings between paired Macs. The newer copy of each
          item wins, and a change on both Macs keeps the newer one; local paths, accounts, and window
          layout stay per-Mac.
        </p>
        {peers.map((p) => {
          const diff = diffs[p.slug];
          const pill = pillFor(p, diff);
          const canSync =
            p.enabled && p.connected && p.supportsSync && busy !== p.slug && (diff?.items?.length ?? 0) > 0;
          const rel = p.lastSyncAt ? relativeTime(Math.floor(p.lastSyncAt / 1000)) : "";
          const lastSynced = !rel
            ? "Never synced"
            : rel === "now"
              ? "Last synced just now"
              : `Last synced ${rel} ago`;
          return (
            <Row key={p.slug}>
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
                <p className="truncate text-[11px] text-[var(--text-muted)]">{lastSynced}</p>
              </div>
              <button
                type="button"
                onClick={() => void syncNow(p)}
                disabled={!canSync}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-default disabled:opacity-40"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--accent-cyan) 12%, transparent)",
                  color: "var(--accent-cyan)",
                }}
              >
                <RefreshCw size={13} className={busy === p.slug ? "animate-spin" : ""} />
                Sync now
              </button>
            </Row>
          );
        })}
      </Group>

      <SyncPreviewModal
        open={preview !== null}
        slug={preview?.slug ?? ""}
        peerName={preview?.name ?? ""}
        items={preview?.items ?? []}
        onClose={() => setPreview(null)}
        onSynced={() => void refreshAll()}
      />
    </section>
  );
}
