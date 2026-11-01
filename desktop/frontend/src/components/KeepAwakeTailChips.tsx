import { tailChoices, tailLabel } from "../keepAwake";
import { KA_CHIP, KA_CHIP_OFF, KA_CHIP_ON } from "./keepAwakeStyles";

// How long to stay awake after the last agent finishes.
export function KeepAwakeTailChips({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="After the last agent finishes">
      <span className="mr-0.5">Then stay awake</span>
      {tailChoices(value).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={m === value}
          title={tailLabel(m)}
          className={`${KA_CHIP} ${m === value ? KA_CHIP_ON : KA_CHIP_OFF}`}
          onClick={() => onChange(m)}
        >
          {m === 0 ? "0" : `${m}m`}
        </button>
      ))}
    </div>
  );
}
