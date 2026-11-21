import { tailChip, tailChoices, tailHint } from "../keepAwake";
import { KA_CHIP_OFF, KA_CHIP_ON, KA_CHIP_SNUG } from "./keepAwakeStyles";
import { Tooltip } from "./ui/Tooltip";

// How long to stay awake after the last agent finishes.
export function KeepAwakeTailChips({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="After the last agent finishes">
      <span className="mr-0.5">Then stay awake</span>
      {tailChoices(value).map((m) => (
        <Tooltip key={m} content={tailHint(m)} delay={300}>
          <button
            type="button"
            role="radio"
            aria-checked={m === value}
            aria-label={tailHint(m)}
            className={`${KA_CHIP_SNUG} ${m === value ? KA_CHIP_ON : KA_CHIP_OFF}`}
            onClick={() => onChange(m)}
          >
            {tailChip(m)}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
