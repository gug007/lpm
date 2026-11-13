import { FLOOR_CHOICES, type KeepAwakePrefs, type KeepAwakeState } from "../keepAwake";
import { KA_FIELD } from "./keepAwakeStyles";

const ROW =
  "mx-1 flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-[var(--bg-hover)]";

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
        <label className={`${ROW} min-h-[29px]`}>
          <input
            id="keep-awake-screen"
            type="checkbox"
            checked={state.screen}
            onChange={(e) => onChange({ screen: e.target.checked })}
            className="accent-[var(--accent-amber)]"
          />
          Keep the screen on too
        </label>
      )}
      <label className={ROW}>
        <input
          id="keep-awake-battery"
          type="checkbox"
          checked={state.battery}
          onChange={(e) => onChange({ battery: e.target.checked })}
          className="accent-[var(--accent-amber)]"
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
