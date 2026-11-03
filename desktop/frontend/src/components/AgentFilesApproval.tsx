import { useCallback, useEffect, useState } from "react";
import { EventsOn } from "../../bridge/runtime";
import { PeerAgentAnswer, PeerAgentRequests } from "../../bridge/commands";
import { Modal } from "./ui/Modal";
import type { AgentFilesRequest } from "../peer/agentFilesWords";
import { AgentCopyDetails } from "./AgentCopyDetails";
import { AgentRunDetails } from "./AgentRunDetails";

const BUTTON =
  "rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";
const PRIMARY =
  "rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90";

// An agent's `lpm cp` or `lpm exec --on` waiting for a yes. Mounted at the app
// root, since it blocks the agent until someone answers here; closing it denies.
export function AgentFilesApproval() {
  const [requests, setRequests] = useState<AgentFilesRequest[]>([]);

  const refresh = useCallback(async () => {
    try {
      setRequests(((await PeerAgentRequests()) as AgentFilesRequest[]) ?? []);
    } catch {
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return EventsOn("agent-files-request", () => void refresh());
  }, [refresh]);

  const active = requests[0] ?? null;
  if (!active) return null;

  const answer = (decision: "deny" | "once" | "tab") => {
    void PeerAgentAnswer(active.id, decision);
    setRequests((cur) => cur.filter((r) => r.id !== active.id));
  };

  return (
    <Modal
      open
      onClose={() => answer("deny")}
      contentClassName="w-[460px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl"
    >
      {active.kind === "run" ? <AgentRunDetails request={active} /> : <AgentCopyDetails request={active} />}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={() => answer("deny")} className={BUTTON}>
          Deny
        </button>
        {active.tabGrant && (
          <button type="button" onClick={() => answer("tab")} className={BUTTON}>
            Allow for this tab
          </button>
        )}
        <button type="button" onClick={() => answer("once")} className={PRIMARY}>
          Allow once
        </button>
      </div>
    </Modal>
  );
}
