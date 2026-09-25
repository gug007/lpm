import { ChevronDown } from "lucide-react";
import { sessionParts } from "./stats-derive";
import {
  formatDuration,
  formatTokenCount,
  fullTimestamp,
  minutesToMs,
  relativeShort,
} from "./stats-format";
import { PROVIDER_META, type SampleSession } from "./stats-sample-data";

export default function StatsSessionRow({
  id,
  session,
  open,
  now,
  onToggle,
  className = "",
}: {
  id: string;
  session: SampleSession;
  open: boolean;
  now: number | null;
  onToggle: () => void;
  className?: string;
}) {
  const meta = PROVIDER_META[session.provider];
  const parts = sessionParts(session);
  const meters = [
    { label: "Input", value: parts.input },
    { label: "Cached", value: parts.cached },
    { label: "Output", value: parts.output },
    { label: "Reasoning", value: parts.reasoning },
  ];
  const lastAt = now === null ? null : now - minutesToMs(session.minutesAgo);

  return (
    <li className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors duration-[120ms] hover:bg-[var(--bg-hover)] -outline-offset-2 sm:gap-2.5 sm:px-4"
      >
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
        <span className="shrink-0 text-[var(--text-secondary)]">{meta.short}</span>
        <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]">
          {session.project}
        </span>
        <span
          title={session.model}
          className="max-w-[84px] shrink-0 truncate rounded bg-[var(--bg-active)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] max-sm:hidden"
        >
          {session.model}
        </span>
        <span className="w-9 shrink-0 text-right tabular-nums text-[var(--text-muted)] max-sm:hidden">
          {formatDuration(minutesToMs(session.minutes))}
        </span>
        <span className="w-10 shrink-0 text-right tabular-nums text-[var(--text-muted)]">
          {relativeShort(session.minutesAgo)}
          <span className="sr-only"> ago</span>
        </span>
        <span className="w-12 shrink-0 text-right font-medium tabular-nums text-[var(--text-primary)] sm:w-14">
          {formatTokenCount(parts.total)}
        </span>
        <ChevronDown
          aria-hidden
          size={13}
          className={`shrink-0 text-[var(--text-muted)] motion-safe:transition-transform motion-safe:duration-200 ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>

      <div
        id={id}
        inert={!open}
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-0.5 sm:px-4">
            <p className="mb-2 text-[10px] text-[var(--text-muted)] sm:hidden">
              {`${session.model} · ${formatDuration(minutesToMs(session.minutes))}`}
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {meters.map((meter) => (
                <div key={meter.label}>
                  <p className="flex items-baseline justify-between text-[10px]">
                    <span className="text-[var(--text-muted)]">{meter.label}</span>
                    <span className="tabular-nums text-[var(--text-secondary)]">
                      {formatTokenCount(meter.value)}
                    </span>
                  </p>
                  <div aria-hidden className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--bg-active)]">
                    <div
                      className="h-full rounded-full bg-[var(--text-secondary)] opacity-50"
                      style={{ width: `${(meter.value / Math.max(1, parts.total)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {lastAt !== null && (
              <p className="mt-3 text-[10px] text-[var(--text-muted)]">
                {`Started ${fullTimestamp(lastAt - minutesToMs(session.minutes))} · Last ${fullTimestamp(lastAt)}`}
              </p>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
