"use client";

import { useId, useState } from "react";
import type { SampleSession } from "./stats-sample-data";
import StatsSessionRow from "./stats-session-row";

const PHONE_COUNT = 4;
const COLLAPSED_COUNT = 12;

export default function StatsSessions({
  sessions,
  available,
  openSession,
  onOpenSession,
  now,
}: {
  sessions: readonly SampleSession[];
  available: number;
  openSession: number | null;
  onOpenSession: (index: number | null) => void;
  now: number | null;
}) {
  const uid = useId();
  const [showAll, setShowAll] = useState(false);
  const total = sessions.length;
  const phoneShown = showAll ? total : Math.min(PHONE_COUNT, total);
  const phoneLabel = showAll ? "Show less" : available > total ? "Show more" : `Show all (${total})`;

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] lg:h-0 lg:min-h-full">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 sm:px-4">
        <p className="min-h-7 content-center text-sm font-medium text-[var(--text-primary)]">
          Recent sessions
        </p>
        <p className="text-[11px] tabular-nums text-[var(--text-muted)]">
          <span className="md:hidden">{`${phoneShown} of ${available}`}</span>
          <span className="max-md:hidden">{`${Math.min(COLLAPSED_COUNT, total)} of ${available}`}</span>
        </p>
      </div>

      <ul className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto [&>li+li]:border-t [&>li+li]:border-[var(--border)]">
        {sessions.map((session, index) => (
          <StatsSessionRow
            key={`${session.provider}-${session.project}-${session.minutesAgo}`}
            id={`${uid}-session-${index}`}
            session={session}
            open={openSession === index}
            now={now}
            onToggle={() => onOpenSession(openSession === index ? null : index)}
            className={index >= PHONE_COUNT && !showAll ? "max-md:hidden" : ""}
          />
        ))}
      </ul>

      {total > PHONE_COUNT && (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll((value) => !value)}
          className="min-h-11 w-full border-t border-[var(--border)] px-4 text-[11px] font-medium text-[var(--text-muted)] transition-colors duration-[120ms] -outline-offset-2 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] md:hidden"
        >
          {phoneLabel}
        </button>
      )}

      {available > COLLAPSED_COUNT && (
        <button
          type="button"
          disabled
          title="Not in this demo"
          className="mt-auto min-h-9 w-full border-t border-[var(--border)] px-4 text-[11px] font-medium text-[var(--text-muted)] max-md:hidden"
        >
          {`Show all (${available})`}
        </button>
      )}
    </div>
  );
}
