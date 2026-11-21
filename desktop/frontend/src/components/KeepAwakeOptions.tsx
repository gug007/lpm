import { FLOOR_CHOICES, type KeepAwakePrefs, type KeepAwakeState } from "../keepAwake";
import { KeepAwakeCheckbox } from "./KeepAwakeCheckbox";
import { KA_FIELD } from "./keepAwakeStyles";

const ROW =
  "group mx-1 flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-[var(--bg-hover)]";
const label = (on: boolean) => (on ? "text-[var(--text-primary)]" : "");

// How Keep awake holds, whichever mode is on: the screen too, and on battery.
// Each whole row toggles its checkbox; the battery level field inside its row
// keeps its own clicks while it's enabled.
export function KeepAwakeOptions({
  state,
  onChange,
}: {
  state: KeepAwakeState;
  onChange: (prefs: KeepAwakePrefs) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-1 text-[11px] text-[var(--text-secondary)]">
      {state.screenSupported && (
        <label className={`${ROW} min-h-[29px] ${label(state.screen)}`}>
          <KeepAwakeCheckbox
            id="keep-awake-screen"
            checked={state.screen}
            onChange={(screen) => onChange({ screen })}
          />
          Keep the screen on too
        </label>
      )}
      <label className={`${ROW} ${label(state.battery)}`}>
        <KeepAwakeCheckbox
          id="keep-awake-battery"
          checked={state.battery}
          onChange={(battery) => onChange({ battery })}
        />
        On battery too, until
        <select
          id="keep-awake-floor"
          aria-label="Battery level to stop at"
          value={state.floor}
          disabled={!state.battery}
          onChange={(e) => onChange({ floor: Number(e.target.value) })}
          className={`${KA_FIELD} cursor-default disabled:pointer-events-none disabled:opacity-50`}
        >
          {FLOOR_CHOICES.map((floor) => (
            <option key={floor} value={floor}>
              {floor}%
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
