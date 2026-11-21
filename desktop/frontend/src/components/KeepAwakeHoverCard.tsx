import { type KeepAwakeSession, keepAwakeSource, useKeepAwakeLeft } from "../hooks/useKeepAwakeSession";
import { EXTRA_MINUTES, keepAwakeLine, keepAwakePowerNote } from "../keepAwake";
import type { KeepAwakeMachine } from "../keepAwakeMachines";
import { MACHINE } from "../machineWords";
import { toast } from "../notifications/toast";
import { CoffeeIcon } from "./icons";
import { KeepAwakeMachineLine } from "./KeepAwakeMachineLine";
import { KA_CHIP, KA_CHIP_OFF } from "./keepAwakeStyles";

// What resting on the Keep awake row or cup shows while it's on: what holds and
// until when, with an hour more and Turn off, so checking or extending doesn't
// take the whole menu. With connected computers on too, a line for each, which
// opens its tab, and Turn all off.
export function KeepAwakeHoverCard({
  session,
  others = [],
  onOpen,
}: {
  session: KeepAwakeSession;
  /** Connected computers whose Keep awake is on. */
  others?: KeepAwakeMachine[];
  onOpen?: (slug: string | null) => void;
}) {
  const { state, endsAt, error, extend, set } = session;
  const left = useKeepAwakeLeft(endsAt);
  if (!state && others.length === 0) return null;
  const localOn = state !== null && state.mode !== "off";
  const anyActive = (localOn && state.active) || others.some((m) => m.reading?.state.active);

  if (others.length > 0) {
    const turnAllOff = () => {
      if (localOn) set("off");
      for (const m of others) {
        if (m.slug) keepAwakeSource(m.slug).set("off").catch((err: unknown) => toast.error(String(err)));
      }
    };
    return (
      <span className="flex w-[260px] flex-col gap-1.5">
        {cardTitle(anyActive)}
        <span className="flex flex-col">
          {localOn && (
            <KeepAwakeMachineLine
              name={MACHINE.ThisMachine}
              state={state}
              endsAt={endsAt}
              onOpen={() => onOpen?.(null)}
            />
          )}
          {others.map(
            (m) =>
              m.reading && (
                <KeepAwakeMachineLine
                  key={m.slug}
                  name={m.name}
                  state={m.reading.state}
                  endsAt={m.reading.endsAt}
                  onOpen={() => onOpen?.(m.slug)}
                />
              ),
          )}
        </span>
        {error && <span className="text-[11px] leading-snug text-[var(--accent-red-text)]">{error}</span>}
        <span className="mt-0.5 flex items-center gap-1.5">
          <button type="button" className={`${KA_CHIP} ${KA_CHIP_OFF}`} onClick={turnAllOff}>
            Turn all off
          </button>
          <span className="ml-auto text-[10.5px] text-[var(--text-muted)]">Click for more</span>
        </span>
      </span>
    );
  }

  if (!state) return null;
  const note = keepAwakePowerNote(state, MACHINE.thisMachine);
  return (
    <span className="flex w-[232px] flex-col gap-1.5">
      {cardTitle(state.active)}
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

function cardTitle(active: boolean) {
  return (
    <span className="flex items-center gap-1.5 font-semibold">
      <span className={active ? "flex text-[var(--accent-amber-text)]" : "flex text-[var(--text-muted)]"}>
        <CoffeeIcon awake={active} />
      </span>
      {active ? "Kept awake" : "Keep awake is on"}
    </span>
  );
}
