import { useState } from "react";
import { shortDuration } from "../jobsFormat";
import { customMinutes, span, TIME_PRESETS } from "../keepAwake";
import { KA_CHIP, KA_CHIP_OFF, KA_FIELD } from "./keepAwakeStyles";

// "For a set time": a chip starts its time; Custom… swaps the chips for hours and
// minutes in the same row, so the menu keeps its height.
export function KeepAwakeTime({ onPick }: { onPick: (minutes: number) => void }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [hours, setHours] = useState("1");
  const [minutes, setMinutes] = useState("30");
  const custom = customMinutes(hours, minutes);

  if (customOpen) {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom === null) return;
          setCustomOpen(false);
          onPick(custom);
        }}
      >
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
        <button
          type="submit"
          disabled={custom === null}
          className="ml-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-primary)] outline-none transition-colors hover:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Start
        </button>
        <button
          type="button"
          aria-label="Back to the preset times"
          title="Back to the preset times"
          onClick={() => setCustomOpen(false)}
          className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:bg-[var(--bg-hover)]"
        >
          ✕
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {TIME_PRESETS.map((m) => (
        <button
          key={m}
          type="button"
          className={`${KA_CHIP} ${KA_CHIP_OFF}`}
          title={`Keep awake for ${span(m)}`}
          onClick={() => onPick(m)}
        >
          {shortDuration(m * 60_000)}
        </button>
      ))}
      <button
        type="button"
        className={`${KA_CHIP} ${KA_CHIP_OFF} border-dashed`}
        onClick={() => setCustomOpen(true)}
      >
        Custom…
      </button>
    </div>
  );
}
