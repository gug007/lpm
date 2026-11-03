import { formatBytes } from "../syncApi";
import { askerLabel, type AgentCopyRequest } from "../peer/agentFilesWords";
import { countOf } from "./ignored/syncWords";
import { AgentRequestRows } from "./AgentRequestRows";

// What a copy an agent asked for would move, for the approval dialog
// (AgentFilesApproval).
export function AgentCopyDetails({ request }: { request: AgentCopyRequest }) {
  const way = request.pulling ? "from" : "to";
  return (
    <>
      <h2 className="text-base font-semibold text-[var(--text-primary)]">
        Let {askerLabel(request)} copy {countOf(request.files, "file")} {way} {request.machine}?
      </h2>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
        {formatBytes(request.bytes)}
        {request.replaces ? ", replacing files already there" : ""}. Nothing moves until you allow it.
      </p>

      <AgentRequestRows
        rows={[
          ["From", request.from],
          ["To", request.to],
        ]}
      />

      {request.sensitive.length > 0 && (
        <div className="mt-3 rounded-lg border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/10 px-3 py-2.5 text-[12px] leading-snug text-[var(--accent-amber-text)]">
          <p className="font-medium">This includes keys, credentials or files that run on their own:</p>
          <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
            {request.sensitive.map((path) => (
              <li key={path} className="break-all">
                {path}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
