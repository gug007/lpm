import { useEffect, useState } from "react";
import { EventsOn } from "../../bridge/runtime";
import { RemoteRespondPairRequest } from "../../bridge/commands";
import { Modal } from "./ui/Modal";

interface PairRequest {
  requestId: string;
  name: string;
  matchCode: string;
}

function groupCode(code: string): string {
  return code.length === 4 ? `${code.slice(0, 2)} ${code.slice(2)}` : code;
}

// Approval dialog for a phone that discovered this Mac and asked to connect
// without a typed code. Mounted at the app root so a request — which can arrive
// at any time — is caught regardless of which view is open. The Mac never auto-
// approves: connecting requires an explicit Allow here.
export function PairApprovalHost() {
  const [request, setRequest] = useState<PairRequest | null>(null);

  useEffect(() => {
    const offRequest = EventsOn("remote-pair-request", (payload: PairRequest) => {
      if (payload?.requestId) setRequest(payload);
    });
    const offResolved = EventsOn(
      "remote-pair-request-resolved",
      (payload: { requestId: string }) => {
        setRequest((cur) =>
          cur && cur.requestId === payload?.requestId ? null : cur,
        );
      },
    );
    return () => {
      if (typeof offRequest === "function") offRequest();
      if (typeof offResolved === "function") offResolved();
    };
  }, []);

  if (!request) return null;

  const respond = (allow: boolean) => {
    void RemoteRespondPairRequest(request.requestId, allow);
    setRequest(null);
  };

  return (
    <Modal
      open
      onClose={() => respond(false)}
      contentClassName="w-[380px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl"
    >
      <h2 className="text-base font-semibold text-[var(--text-primary)]">
        Allow this device to connect?
      </h2>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
        <span className="font-medium text-[var(--text-primary)]">
          {request.name}
        </span>{" "}
        wants to control this Mac from the lpm app.
      </p>

      <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-4 text-center">
        <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Match code
        </div>
        <div className="mt-1.5 font-mono text-3xl font-semibold tracking-[0.2em] text-[var(--text-primary)] tabular-nums">
          {groupCode(request.matchCode)}
        </div>
      </div>
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Only allow if this code matches the one shown on the phone.
      </p>

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
          Allow
        </button>
      </div>
    </Modal>
  );
}
