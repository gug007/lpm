import { useState } from "react";
import type { AgentSessionUsage } from "../../types";
import { CAPS_LABEL } from "../settings/sectionStyles";
import { BTN_SECONDARY_SM } from "../ui/buttons";
import { SessionRow } from "./SessionRow";

const COLLAPSED_COUNT = 5;

interface RecentSessionsPanelProps {
  sessions: AgentSessionUsage[];
  /** Every session in view; only the latest ones are listed. */
  total: number;
  emptyLabel: string;
  // Display names by machine id, for sessions listed from several computers.
  machineNames?: Record<string, string>;
}

export function RecentSessionsPanel({
  sessions,
  total,
  emptyLabel,
  machineNames,
}: RecentSessionsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? sessions : sessions.slice(0, COLLAPSED_COUNT);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
        <h2 className="text-sm font-semibold">Recent sessions</h2>
        {sessions.length > 0 && (
          <span className="flex items-center gap-3 text-[12px] tabular-nums text-[var(--text-muted)]">
            Latest {shown.length} of {Math.max(total, sessions.length).toLocaleString()}
            {sessions.length > COLLAPSED_COUNT && (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className={`${BTN_SECONDARY_SM} -my-1 whitespace-nowrap`}
              >
                {expanded ? "Show fewer" : `Show ${sessions.length - COLLAPSED_COUNT} more`}
              </button>
            )}
          </span>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 pb-8 pt-4 text-center text-[12px] text-[var(--text-muted)]">
          {total > 0
            ? `${total.toLocaleString()} session${total === 1 ? "" : "s"} ${emptyLabel}, older than the ones listed`
            : `Nothing ${emptyLabel}`}
        </div>
      ) : (
        <>
          <div className={`flex items-center gap-2.5 border-b border-[var(--border)] px-4 pb-1.5 pt-1 ${CAPS_LABEL}`}>
            <span className="min-w-0 flex-1">Session</span>
            <span className="w-[88px] shrink-0">Model</span>
            <span className="w-11 shrink-0 text-right">Length</span>
            <span className="w-10 shrink-0 text-right">Ago</span>
            <span className="w-14 shrink-0 text-right">Tokens</span>
            <span className="w-[13px] shrink-0" />
          </div>
          <div
            className="divide-y divide-[var(--border)] overflow-y-auto"
            style={{ maxHeight: expanded ? 420 : undefined }}
          >
            {shown.map((session, index) => (
              <SessionRow
                key={`${session.provider}-${session.project}-${session.startedAt}-${session.lastAt}-${index}`}
                session={session}
                machineName={session.machine ? machineNames?.[session.machine] : undefined}
              />
            ))}
          </div>
          {expanded && total > sessions.length && (
            <div className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
              Only the {sessions.length} most recent sessions are listed.
            </div>
          )}
        </>
      )}
    </div>
  );
}
