import { useCallback, useEffect, useState } from "react";
import { PeerList, PeerPair, PeerRemove } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";

interface Peer {
  id: string;
  name: string;
  host: string;
  port: number;
  status: string;
}

const STATUS_COLOR: Record<string, string> = {
  connected: "var(--accent-green)",
  connecting: "var(--accent-amber)",
};

const STATUS_LABEL: Record<string, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  offline: "Can't reach this Mac",
};

function statusColor(status: string) {
  return STATUS_COLOR[status] ?? "var(--text-muted)";
}

function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? "Offline";
}

function DesktopIcon({ size = 16 }: { size?: number } = {}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function ConnectedMacsSection() {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [link, setLink] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = (await PeerList()) as Peer[];
      setPeers(list);
    } catch {
      /* hub may still be starting; leave the current list */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      EventsOn("peer-status", (payload: { id: string; status: string }) => {
        setPeers((prev) => {
          const known = prev.some((p) => p.id === payload.id);
          if (!known) {
            void refresh();
            return prev;
          }
          return prev.map((p) => (p.id === payload.id ? { ...p, status: payload.status } : p));
        });
      }),
    [refresh],
  );

  const connect = useCallback(async () => {
    const value = link.trim();
    if (!value || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const peer = (await PeerPair(value)) as Peer;
      setPeers((prev) => [...prev.filter((p) => p.id !== peer.id), peer]);
      setLink("");
    } catch (e) {
      setError(typeof e === "string" ? e : "Couldn't connect to that Mac.");
    } finally {
      setConnecting(false);
    }
  }, [link, connecting]);

  const remove = useCallback(async (id: string) => {
    try {
      const list = (await PeerRemove(id)) as Peer[];
      setPeers(list);
    } catch {
      setPeers((prev) => prev.filter((p) => p.id !== id));
    }
  }, []);

  return (
    <div className="mt-8">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
        Connected Macs
      </h2>
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <div className="px-4 py-3">
          <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
            Control another Mac from this one. On the other Mac, open this pane, add a device, and
            copy its pairing link — then paste it here.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={link}
              placeholder="Paste a pairing link"
              spellCheck={false}
              onChange={(e) => {
                setLink(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void connect();
              }}
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
            />
            <button
              onClick={() => void connect()}
              disabled={connecting || link.trim() === ""}
              className="shrink-0 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-sm font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              {connecting ? "Connecting…" : "Connect"}
            </button>
          </div>
          {error && <p className="mt-2 text-[12px] text-[var(--accent-red)]">{error}</p>}
        </div>

        {peers.length > 0 && (
          <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {peers.map((peer) => (
              <div key={peer.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-active)] text-[var(--text-muted)]">
                  <DesktopIcon />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {peer.name || peer.host || "Mac"}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12px]">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: statusColor(peer.status) }}
                    />
                    <span className="text-[var(--text-muted)]">{statusLabel(peer.status)}</span>
                  </div>
                </div>
                <button
                  onClick={() => void remove(peer.id)}
                  className="shrink-0 rounded-md px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)]"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
