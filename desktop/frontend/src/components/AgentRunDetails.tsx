import { askerLabel, type AgentRunRequest } from "../peer/agentFilesWords";
import { AgentRequestRows } from "./AgentRequestRows";

// What a command an agent asked to run on another computer would do, for the
// approval dialog (AgentFilesApproval).
export function AgentRunDetails({ request }: { request: AgentRunRequest }) {
  return (
    <>
      <h2 className="text-base font-semibold text-[var(--text-primary)]">
        Let {askerLabel(request)} run a command on {request.machine}?
      </h2>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
        It runs as your account there, so it can change anything you can. Nothing runs until you allow it.
      </p>

      <AgentRequestRows
        rows={[
          ["Run", request.command],
          ["In", request.cwd],
        ]}
      />

      {request.tabGrant && (
        <p className="mt-3 text-[12px] leading-snug text-[var(--text-muted)]">
          Allow for this tab lets it run any command on {request.machine} until the tab closes.
        </p>
      )}
    </>
  );
}
