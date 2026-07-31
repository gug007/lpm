import { useCallback, useEffect, useState } from "react";
import { EventsOn } from "../../../bridge/runtime";
import { PeerState, PeerHostRespondPairing } from "../../../bridge/commands";
import { Modal } from "../ui/Modal";
import type { PeerPairRequest, PeerStateShape } from "../../peer/usePeerState";

function groupSas(sas: string): string {
  return sas.length === 6 ? `${sas.slice(0, 3)} ${sas.slice(3)}` : sas;
}

// Approval dialog for another Mac that discovered this one on the network and
// asked to connect without an invite. Mounted at the app root so a request — which
// can arrive at any time — is caught regardless of which view is open. This Mac
// never auto-approves; connecting requires an explicit Accept here after the
// person confirms the code matches the one shown on the other Mac.
export function PairRequestDialog() {
  const [requests, setRequests] = useState<PeerPairRequest[]>([]);
  const [reciprocal, setReciprocal] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = (await PeerState()) as PeerStateShape;
      setRequests(s?.host?.pairRequests ?? []);
    } catch {
      /* peer server may be settling; keep last known */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const offRequest = EventsOn("peer-pair-request", () => void refresh());
    const offState = EventsOn("peer-state-changed", () => void refresh());
    return () => {
      if (typeof offRequest === "function") offRequest();
      if (typeof offState === "function") offState();
    };
  }, [refresh]);

  const active = requests[0] ?? null;

  // Fresh request → reset the reciprocal choice (default off).
  useEffect(() => {
    setReciprocal(false);
  }, [active?.id]);

  if (!active) return null;

  const respond = (accept: boolean) => {
    void PeerHostRespondPairing(active.id, accept, accept && reciprocal);
    // Optimistically drop it; peer-state-changed will confirm shortly.
    setRequests((cur) => cur.filter((r) => r.id !== active.id));
  };

  return (
    <Modal
      open
      onClose={() => respond(false)}
      contentClassName="w-[380px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl"
    >
      <h2 className="text-base font-semibold text-[var(--text-primary)]">
        {active.name} wants to connect
      </h2>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
        Make sure this code matches the one on{" "}
        <span className="font-medium text-[var(--text-primary)]">{active.name}</span>.
      </p>

      <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-4 text-center">
        <div className="font-mono text-3xl font-semibold tracking-[0.2em] text-[var(--text-primary)] tabular-nums">
          {groupSas(active.sas)}
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={reciprocal}
          onChange={(e) => setReciprocal(e.target.checked)}
          className="h-4 w-4 accent-[var(--accent-cyan)]"
        />
        Also control {active.name} from this Mac
      </label>

      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={() => respond(false)}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          Deny
        </button>
        <button
          onClick={() => respond(true)}
          className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90"
        >
          Accept
        </button>
      </div>
    </Modal>
  );
}
