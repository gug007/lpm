import { useState } from "react";
import { shortDuration } from "../jobsFormat";
import { EXTEND_CHOICES, TIME_PRESETS } from "../keepAwake";
import { KeepAwakeCustomTime } from "./KeepAwakeCustomTime";
import { KeepAwakeEndsAt } from "./KeepAwakeEndsAt";
import { KA_CHIP, KA_CHIP_OFF, KA_LINK } from "./keepAwakeStyles";
import { Tooltip } from "./ui/Tooltip";

const chipLabel = (minutes: number) => shortDuration(minutes * 60_000);

// "For a set time": a chip starts its time, and Custom… asks for hours and
// minutes or a time of day. While a time runs, the chips add to it instead,
// and Change… brings the presets back to start over.
export function KeepAwakeTime({
  endsAt,
  onPick,
  onExtend,
}: {
  /** When the set time that is running ends; null while none runs. */
  endsAt: number | null;
  onPick: (minutes: number) => void;
  onExtend: (minutes: number) => void;
}) {
  const [view, setView] = useState<"chips" | "presets" | "custom">("chips");
  const running = endsAt !== null;
  const pick = (minutes: number) => {
    setView("chips");
    onPick(minutes);
  };

  if (view === "custom") return <KeepAwakeCustomTime onStart={pick} onBack={() => setView("chips")} />;

  if (running && view === "chips") {
    return (
      <div className="flex w-full flex-wrap items-center gap-1" role="group" aria-label="Add to the time left">
        {EXTEND_CHOICES.map((m) => (
          <Tooltip key={m} content={<KeepAwakeEndsAt minutes={m} from={endsAt} />} delay={300}>
            <button type="button" className={`${KA_CHIP} ${KA_CHIP_OFF}`} onClick={() => onExtend(m)}>
              +{chipLabel(m)}
            </button>
          </Tooltip>
        ))}
        <button
          type="button"
          className={`${KA_CHIP} ${KA_CHIP_OFF} ml-auto border-dashed`}
          onClick={() => setView("presets")}
        >
          Change…
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-1">
      {TIME_PRESETS.map((m) => (
        <Tooltip key={m} content={<KeepAwakeEndsAt minutes={m} />} delay={300}>
          <button type="button" className={`${KA_CHIP} ${KA_CHIP_OFF}`} onClick={() => pick(m)}>
            {chipLabel(m)}
          </button>
        </Tooltip>
      ))}
      <button type="button" className={`${KA_CHIP} ${KA_CHIP_OFF} border-dashed`} onClick={() => setView("custom")}>
        Custom…
      </button>
      {running && (
        <Tooltip content="Back to the time running" triggerClassName="ml-auto inline-flex">
          <button
            type="button"
            aria-label="Back to the time running"
            onClick={() => setView("chips")}
            className={`${KA_LINK} text-[var(--text-muted)] hover:text-[var(--text-primary)]`}
          >
            ✕
          </button>
        </Tooltip>
      )}
    </div>
  );
}
