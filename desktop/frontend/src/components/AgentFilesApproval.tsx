import { useCallback, useEffect, useState } from "react";
import { EventsOn } from "../../bridge/runtime";
import { PeerAgentAnswer, PeerAgentRequests } from "../../bridge/commands";
import { Modal } from "./ui/Modal";
import { formatBytes } from "../syncApi";
import { askerLabel, type AgentFilesRequest } from "../peer/agentFilesWords";
import { countOf } from "./ignored/syncWords";

const BUTTON =
  "rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";
const PRIMARY =
  "rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90";

function PathRow({ label, path }: { label: string; path: string }) {
  return (
    <div className="flex gap-3 text-[12px]">
      <span className="w-9 shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 break-all font-mono text-[var(--text-primary)]">{path}</span>
    </div>
  );
}

// An agent's `lpm cp` waiting for a yes. Mounted at the app root, since the
// copy blocks the agent until someone answers here; closing it denies.
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
  const way = active.pulling ? "from" : "to";

  return (
    <Modal
      open
      onClose={() => answer("deny")}
      contentClassName="w-[460px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl"
    >
      <h2 className="text-base font-semibold text-[var(--text-primary)]">
        Let {askerLabel(active)} copy {countOf(active.files, "file")} {way} {active.machine}?
      </h2>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
        {formatBytes(active.bytes)}
        {active.replaces ? ", replacing files already there" : ""}. Nothing moves until you allow it.
      </p>

      <div className="mt-4 space-y-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
        <PathRow label="From" path={active.from} />
        <PathRow label="To" path={active.to} />
      </div>

      {active.sensitive.length > 0 && (
        <div className="mt-3 rounded-lg border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/10 px-3 py-2.5 text-[12px] leading-snug text-[var(--accent-amber-text)]">
          <p className="font-medium">This includes keys, credentials or files that run on their own:</p>
          <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
            {active.sensitive.map((path) => (
              <li key={path} className="break-all">
                {path}
              </li>
            ))}
          </ul>
        </div>
      )}

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
