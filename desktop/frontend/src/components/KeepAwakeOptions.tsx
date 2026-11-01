import { FLOOR_CHOICES, type KeepAwakePrefs, type KeepAwakeState } from "../keepAwake";
import { KA_FIELD } from "./keepAwakeStyles";

// How Keep awake holds, whichever mode is on: the screen too, and on battery.
export function KeepAwakeOptions({
  state,
  onChange,
}: {
  state: KeepAwakeState;
  onChange: (prefs: KeepAwakePrefs) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-1.5 text-[11px] text-[var(--text-secondary)]">
      {state.screenSupported && (
        <label className="flex cursor-pointer items-center gap-2">
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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            id="keep-awake-battery"
            type="checkbox"
            checked={state.battery}
            onChange={(e) => onChange({ battery: e.target.checked })}
            className="accent-[var(--accent-amber)]"
          />
          On battery too, until
        </label>
        <select
          id="keep-awake-floor"
          aria-label="Battery level to stop at"
          value={state.floor}
          disabled={!state.battery}
          onChange={(e) => onChange({ floor: Number(e.target.value) })}
          className={`${KA_FIELD} disabled:opacity-50`}
        >
          {FLOOR_CHOICES.map((floor) => (
            <option key={floor} value={floor}>
              {floor}%
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
