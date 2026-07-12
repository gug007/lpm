import { useEffect, useMemo, useState } from "react";
import { usePeersStore, type RemoteTerminal } from "../store/peers";
import { RemoteTerminalMirror } from "./RemoteTerminalMirror";
import { TerminalIcon } from "./icons";

export function RemoteProjectView({ peerId, project }: { peerId: string; project: string }) {
  const peer = usePeersStore((s) => s.peers.find((p) => p.id === peerId) ?? null);
  const terminals = usePeersStore(
    (s) => s.terminalsByPeer[peerId]?.[project] ?? (EMPTY as RemoteTerminal[]),
  );
  const requestTerminals = usePeersStore((s) => s.requestTerminals);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    requestTerminals(peerId, project);
  }, [peerId, project, requestTerminals]);

  // Keep a valid selection as the terminal list arrives or changes.
  useEffect(() => {
    if (terminals.length === 0) {
      setActiveId(null);
      return;
    }
    setActiveId((cur) => (cur && terminals.some((t) => t.id === cur) ? cur : terminals[0].id));
  }, [terminals]);

  const active = useMemo(
    () => terminals.find((t) => t.id === activeId) ?? null,
    [terminals, activeId],
  );

  const connected = peer?.status === "connected";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
      <div className="mb-2 flex items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: connected ? "var(--accent-green)" : "var(--text-muted)" }}
        />
        <h1 className="truncate text-sm font-semibold text-[var(--text-primary)]">{project}</h1>
        <span className="truncate text-xs text-[var(--text-muted)]">on {peer?.name ?? "Mac"}</span>
      </div>

      {!connected ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
          <TerminalIcon />
          <p className="text-xs">Can't reach this Mac right now.</p>
        </div>
      ) : terminals.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
          <TerminalIcon />
          <p className="text-xs">No terminals open in this project.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-lg border-t border-x border-[var(--border)] bg-[var(--terminal-bg)]">
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--terminal-header)] px-1.5 py-1">
            {terminals.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`shrink-0 rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  t.id === activeId
                    ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {t.label || t.id}
              </button>
            ))}
          </div>
          {active && (
            <RemoteTerminalMirror key={`${peerId}:${active.id}`} peerId={peerId} terminal={active} />
          )}
        </div>
      )}
    </div>
  );
}

const EMPTY: RemoteTerminal[] = [];
