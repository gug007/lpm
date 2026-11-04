import { useCallback, useEffect, useRef, useState } from "react";
import { PeerSyncStatus } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { subscribePeerGlobalEvent } from "./route";
import type { PeerClient } from "./usePeerState";
import type { SyncItem } from "../components/connections/SyncPreviewModal";
import { relativeTime } from "../relativeTime";
import { MACHINE as M } from "../machineWords";

export interface SyncDiff {
  loading: boolean;
  items: SyncItem[] | null;
  error: string | null;
  // Skills left on one side: the other keeps something else under that name.
  skippedSkills?: string[];
}

export interface SyncPill {
  text: string;
  color: string;
  title?: string;
}

export interface SyncPreview {
  slug: string;
  name: string;
  items: SyncItem[];
}

export function syncPill(peer: PeerClient, diff: SyncDiff | undefined): SyncPill {
  if (!peer.enabled) return { text: "Off", color: "var(--text-muted)" };
  if (!peer.connected) return { text: "Offline", color: "var(--text-muted)" };
  if (!peer.supportsSync)
    return {
      text: "Update needed",
      color: "var(--accent-amber)",
      title: `${M.OtherMachine} needs to update lpm to sync config.`,
    };
  if (!diff || diff.loading) return { text: "Checking…", color: "var(--text-muted)" };
  if (diff.error) return { text: "Error", color: "var(--accent-red)", title: diff.error };
  const n = diff.items?.length ?? 0;
  if (n === 0) return { text: "In sync", color: "var(--accent-green)" };
  return { text: n === 1 ? "1 item differs" : `${n} items differ`, color: "var(--accent-amber)" };
}

// When auto-sync is on but the peer can't sync yet, one short reason in product
// terms. Null when off (nothing to explain) or fully able to sync (no hint).
export function autoSyncHint(p: PeerClient): string | null {
  if (!p.autoSync) return null;
  if (!p.connected) return `Waits until ${M.otherMachine} is connected.`;
  if (!p.supportsSync2) return `Waits until ${M.otherMachine} is updated.`;
  if (!p.pinned) return `Waits until ${M.thisMachine} and ${M.otherMachine} have verified each other.`;
  return null;
}

export function skippedSkillsText(names: string[] | undefined): string | null {
  if (!names?.length) return null;
  const list = names.map((name) => `/${name}`).join(", ");
  return names.length === 1
    ? `${list}: a different skill has that name on one of these ${M.plural}.`
    : `${list}: different skills have those names on one of these ${M.plural}.`;
}

export function lastSyncedText(p: PeerClient): string {
  const rel = p.lastSyncAt ? relativeTime(Math.floor(p.lastSyncAt / 1000)) : "";
  if (!rel) return "Never synced";
  return rel === "now" ? "Last synced just now" : `Last synced ${rel} ago`;
}

export function canSyncNow(p: PeerClient, diff: SyncDiff | undefined, busy: string | null): boolean {
  return p.enabled && p.connected && !!p.supportsSync && busy !== p.slug && (diff?.items?.length ?? 0) > 0;
}

// What differs between this machine and each peer it can sync with, kept fresh
// as config changes on either side, and the preview a "Sync now" opens.
export function usePeerSync(peers: PeerClient[]) {
  const [diffs, setDiffs] = useState<Record<string, SyncDiff>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<SyncPreview | null>(null);

  // Latest peer list, read by event handlers without re-subscribing on each change.
  const peersRef = useRef(peers);
  peersRef.current = peers;

  const load = useCallback(async (slug: string): Promise<SyncItem[] | null> => {
    setDiffs((d) => ({
      ...d,
      [slug]: {
        loading: true,
        items: d[slug]?.items ?? null,
        error: null,
        skippedSkills: d[slug]?.skippedSkills,
      },
    }));
    try {
      const res = (await PeerSyncStatus(slug)) as { items: SyncItem[]; skippedSkills?: string[] };
      const items = res?.items ?? [];
      const skippedSkills = res?.skippedSkills;
      setDiffs((d) => ({ ...d, [slug]: { loading: false, items, error: null, skippedSkills } }));
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
      const next: Record<string, SyncDiff> = {};
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
      EventsOn("memory-changed", debounced),
      EventsOn("lpm-commands-changed", debounced),
      subscribePeerGlobalEvent("projects-changed", debounced),
      subscribePeerGlobalEvent("templates-changed", debounced),
      subscribePeerGlobalEvent("memory-changed", debounced),
      subscribePeerGlobalEvent("lpm-commands-changed", debounced),
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

  const closePreview = useCallback(() => setPreview(null), []);

  return { diffs, busy, preview, syncNow, closePreview, refreshAll };
}
