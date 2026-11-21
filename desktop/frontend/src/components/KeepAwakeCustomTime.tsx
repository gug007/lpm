import { useState } from "react";
import { customMinutes, minutesUntil, untilAt } from "../keepAwake";
import { KA_FIELD, KA_LINK } from "./keepAwakeStyles";
import { Tooltip } from "./ui/Tooltip";

type Kind = "for" | "until";

const KINDS: { kind: Kind; label: string }[] = [
  { kind: "for", label: "For" },
  { kind: "until", label: "Until" },
];

// Custom… in "For a set time": hours and minutes from now, or a time of day
// (the next time the clock reads it).
export function KeepAwakeCustomTime({ onStart, onBack }: { onStart: (minutes: number) => void; onBack: () => void }) {
  const [kind, setKind] = useState<Kind>("for");
  const [hours, setHours] = useState("1");
  const [minutes, setMinutes] = useState("30");
  const [atHours, setAtHours] = useState(() => String((new Date().getHours() + 2) % 24));
  const [atMinutes, setAtMinutes] = useState("00");

  const now = new Date();
  const at = kind === "until" ? untilAt(atHours, atMinutes, now) : null;
  const total = kind === "for" ? customMinutes(hours, minutes) : at === null ? null : minutesUntil(at, now);
  const day = at === null ? "" : new Date(at).getDate() === now.getDate() ? "today" : "tomorrow";

  return (
    <form
      className="flex w-full flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (total !== null) onStart(total);
      }}
    >
      <div className="flex items-center gap-1">
        <div
          role="radiogroup"
          aria-label="Keep awake for a length of time or until a time of day"
          className="flex rounded-md border border-[var(--border)] bg-[var(--bg-primary)] p-px"
        >
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={kind === k.kind}
              onClick={() => setKind(k.kind)}
              className={`rounded px-2 py-px text-[10.5px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]/60 ${
                kind === k.kind
                  ? "bg-[var(--bg-active)] font-semibold text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <Tooltip content="Back to the preset times" triggerClassName="ml-auto inline-flex">
          <button
            type="button"
            aria-label="Back to the preset times"
            onClick={onBack}
            className={`${KA_LINK} text-[var(--text-muted)] hover:text-[var(--text-primary)]`}
          >
            ✕
          </button>
        </Tooltip>
      </div>
      <div className="flex items-center gap-1">
        {kind === "for" ? (
          <>
            <input
              id="keep-awake-hours"
              aria-label="Hours"
              type="number"
              min={0}
              max={99}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className={`${KA_FIELD} w-11`}
            />
            <span>h</span>
            <input
              id="keep-awake-minutes"
              aria-label="Minutes"
              type="number"
              min={0}
              max={59}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className={`${KA_FIELD} w-11`}
            />
            <span>min</span>
          </>
        ) : (
          <>
            <input
              id="keep-awake-until-hours"
              aria-label="Hour of the day, 0 to 23"
              inputMode="numeric"
              maxLength={2}
              value={atHours}
              onChange={(e) => setAtHours(e.target.value)}
              className={`${KA_FIELD} w-9 text-center`}
            />
            <span>:</span>
            <input
              id="keep-awake-until-minutes"
              aria-label="Minutes past the hour"
              inputMode="numeric"
              maxLength={2}
              value={atMinutes}
              onChange={(e) => setAtMinutes(e.target.value)}
              className={`${KA_FIELD} w-9 text-center`}
            />
            <span className="ml-0.5">{day}</span>
          </>
        )}
        <button
          type="submit"
          disabled={total === null}
          className={`${KA_LINK} ml-auto font-medium text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40`}
        >
          Start
        </button>
      </div>
    </form>
  );
}
