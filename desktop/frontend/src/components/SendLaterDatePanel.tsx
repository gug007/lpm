import type { KeyboardEvent } from "react";

interface SendLaterDatePanelProps {
  value: number;
  onChange: (at: number) => void;
  onBack: () => void;
  onCommit: () => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

function dateValue(at: number) {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeValue(at: number) {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function combine(date: string, time: string): number | null {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (![y, m, d, hh, mm].every(Number.isFinite)) return null;
  return new Date(y, m - 1, d, hh, mm).getTime();
}

const FIELD_CLASS =
  "h-8 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 text-[12px] text-[var(--text-primary)] outline-none [color-scheme:inherit] focus:border-[var(--accent-blue)]";

// Any day and time, for when the line's stretch to tomorrow morning is too short.
export function SendLaterDatePanel({ value, onChange, onBack, onCommit }: SendLaterDatePanelProps) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    onCommit();
  };
  return (
    <div className="flex flex-col gap-2.5 px-1 py-1">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          Day
          <input
            id="send-later-date"
            type="date"
            autoFocus
            value={dateValue(value)}
            onChange={(e) => {
              const at = combine(e.target.value, timeValue(value));
              if (at !== null) onChange(at);
            }}
            onKeyDown={onKeyDown}
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          Time
          <input
            id="send-later-time"
            type="time"
            value={timeValue(value)}
            onChange={(e) => {
              const at = combine(dateValue(value), e.target.value);
              if (at !== null) onChange(at);
            }}
            onKeyDown={onKeyDown}
            className={FIELD_CLASS}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="self-start text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        ‹ Back to the timeline
      </button>
    </div>
  );
}
