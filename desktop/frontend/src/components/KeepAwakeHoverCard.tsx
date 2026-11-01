import { type KeepAwakeSession, useKeepAwakeLeft } from "../hooks/useKeepAwakeSession";
import { EXTRA_MINUTES, keepAwakeLine, keepAwakePowerNote } from "../keepAwake";
import { MACHINE } from "../machineWords";
import { CoffeeIcon } from "./icons";
import { KA_CHIP, KA_CHIP_OFF } from "./keepAwakeStyles";

// What resting on the Keep awake row shows while it's on: what holds and until
// when, with an hour more and Turn off, so checking or extending doesn't take
// the whole menu.
export function KeepAwakeHoverCard({ session }: { session: KeepAwakeSession }) {
  const { state, endsAt, error, extend, set } = session;
  const left = useKeepAwakeLeft(endsAt);
  if (!state) return null;
  const note = keepAwakePowerNote(state, MACHINE.thisMachine);

  return (
    <span className="flex w-[232px] flex-col gap-1.5">
      <span className="flex items-center gap-1.5 font-semibold">
        <span className={state.active ? "flex text-[var(--accent-amber-text)]" : "flex text-[var(--text-muted)]"}>
          <CoffeeIcon awake={state.active} />
        </span>
        {state.active ? "Kept awake" : "Keep awake is on"}
      </span>
      <span className="text-[11.5px] leading-snug text-[var(--text-secondary)]" aria-live="polite">
        {keepAwakeLine(state, left)}
      </span>
      {note && <span className="text-[11px] leading-snug text-[var(--accent-amber-text)]">{note}</span>}
      {error && <span className="text-[11px] leading-snug text-[var(--accent-red-text)]">{error}</span>}
      <span className="mt-0.5 flex items-center gap-1.5">
        {endsAt !== null && (
          <button type="button" className={`${KA_CHIP} ${KA_CHIP_OFF}`} onClick={() => extend(EXTRA_MINUTES)}>
            +1 h
          </button>
        )}
        <button type="button" className={`${KA_CHIP} ${KA_CHIP_OFF}`} onClick={() => set("off")}>
          Turn off
        </button>
        <span className="ml-auto text-[10.5px] text-[var(--text-muted)]">Click for more</span>
      </span>
    </span>
  );
}
