import { useMemo, useState } from "react";
import { LoaderCircle, RefreshCw, Search } from "lucide-react";
import { usePeerState } from "../../peer/usePeerState";
import { useAppStore } from "../../store/app";
import { useListeningPorts } from "../../store/listeningPorts";
import { Switch } from "../ui/Switch";
import { copyPortUrl, killPortHolder, openPort, stopPortService } from "./portsActions";
import { matchesFilter, portKey, type ListeningPort } from "./portsModel";
import { PortsKillDialog } from "./PortsKillDialog";
import { PortsRow } from "./PortsRow";
import { FOCUS, PORTS_GRID } from "./portsStyles";
import { usePortsPolling } from "./usePortsPolling";

const POLL_MS = 5_000;

export function PortsView() {
  const overview = useListeningPorts((s) => s.overview);
  const loading = useListeningPorts((s) => s.loading);
  const error = useListeningPorts((s) => s.error);
  const computers = useListeningPorts((s) => s.computers);
  const load = useListeningPorts((s) => s.load);
  const setComputers = useListeningPorts((s) => s.setComputers);
  const selectProject = useAppStore((s) => s.selectProject);
  const { state: peerState } = usePeerState();
  const [query, setQuery] = useState("");
  const [killing, setKilling] = useState<ListeningPort | null>(null);
  usePortsPolling(POLL_MS);

  const ports = overview?.ports ?? [];
  const shown = useMemo(() => ports.filter((p) => matchesFilter(p, query)), [ports, query]);
  const failed = (overview?.machines ?? []).filter((m) => m.error);
  const machineCount = new Set(ports.map((p) => p.machine)).size;
  const subtitle = overview
    ? `${ports.length} listening${computers && machineCount > 1 ? ` on ${machineCount} computers` : ""}`
    : "Reading the ports…";
  const now = Date.now();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="app-drag -mx-6 flex items-center gap-3 px-6 py-1">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Ports</h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>
        </div>
        <label className="flex h-8 w-48 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 text-xs focus-within:border-[var(--text-muted)]">
          <Search size={13} className="shrink-0 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter"
            aria-label="Filter ports"
            className="min-w-0 flex-1 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
        </label>
        {(peerState.peers.length > 0 || computers) && (
          <button
            role="switch"
            aria-checked={computers}
            onClick={() => setComputers(!computers)}
            className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] ${FOCUS}`}
          >
            <Switch checked={computers} />
            Paired computers
          </button>
        )}
        <button
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh ports"
          className={`flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50 ${FOCUS}`}
        >
          {loading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 px-4 py-3 text-sm text-[var(--accent-red-text)]">
          Could not read the ports: {error}
        </div>
      )}
      {failed.map((m) => (
        <p key={m.id} className="mt-2 text-xs text-[var(--accent-amber-text)]">
          {m.name}: {m.error}
        </p>
      ))}

      <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--border)]">
        <div className="min-w-[44rem]">
          <div
            className={`${PORTS_GRID} sticky top-0 z-[1] border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]`}
          >
            <span>Port</span>
            <span>Held by</span>
            <span>Project</span>
            <span>Computer</span>
            <span>Up</span>
            <span />
          </div>
          {shown.map((p) => (
            <PortsRow
              key={portKey(p)}
              port={p}
              nowMs={now}
              onOpen={() => void openPort(p)}
              onCopy={() => void copyPortUrl(p)}
              onStop={() => void stopPortService(p)}
              onKill={() => setKilling(p)}
              onSelectProject={() => selectProject(p.project)}
            />
          ))}
          {overview && shown.length === 0 && (
            <p className="px-4 py-10 text-center text-xs text-[var(--text-muted)]">
              {ports.length === 0 ? "Nothing is listening on a TCP port." : `No port matches “${query}”.`}
            </p>
          )}
        </div>
      </div>

      <PortsKillDialog
        port={killing}
        onCancel={() => setKilling(null)}
        onConfirm={(p) => {
          setKilling(null);
          void killPortHolder(p);
        }}
      />
    </div>
  );
}
