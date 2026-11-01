import { useKeepAwakeSession } from "../../hooks/useKeepAwakeSession";
import { FLOOR_CHOICES, tailChoices, tailLabel } from "../../keepAwake";
import { rowProps } from "../../settings-registry";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { AnchoredSelect } from "../ui/AnchoredSelect";
import { Toggle } from "../ui/Toggle";
import { useRowReach, useSettingsTarget } from "./settingsTarget";

// How Keep awake holds the machine, whichever mode the sidebar's menu turns on.
export function KeepAwakeSection() {
  const { machine } = useSettingsTarget();
  const shows = useRowReach();
  const shown = shows("general.keepAwakeTail");
  const { state, error, setPrefs } = useKeepAwakeSession(machine.kind === "peer" ? machine.slug : null, shown);

  if (!state?.supported || !shown) return null;

  return (
    <SettingsSection title="Keep awake">
      <SettingsRow {...rowProps("general.keepAwakeTail")}>
        <AnchoredSelect
          value={state.tailMinutes}
          options={tailChoices(state.tailMinutes)}
          onChange={(tailMinutes) => setPrefs({ tailMinutes })}
          label={tailLabel}
          ariaLabel="How long to stay awake after the last agent finishes"
          panelWidth={180}
          triggerClassName="w-36"
        />
      </SettingsRow>
      {state.screenSupported && (
        <SettingsRow {...rowProps("general.keepAwakeScreen")}>
          <Toggle
            aria-label="Keep the screen on too"
            enabled={state.screen}
            onChange={(screen) => setPrefs({ screen })}
          />
        </SettingsRow>
      )}
      <SettingsRow
        {...rowProps("general.keepAwakeBattery")}
        below={error ? <p className="mt-1 text-[11px] text-[var(--accent-red-text)]">{error}</p> : undefined}
      >
        <Toggle
          aria-label="Keep awake on battery"
          enabled={state.battery}
          onChange={(battery) => setPrefs({ battery })}
        />
      </SettingsRow>
      {state.battery && (
        <SettingsRow nested {...rowProps("general.keepAwakeFloor")}>
          <AnchoredSelect
            value={state.floor}
            options={FLOOR_CHOICES}
            onChange={(floor) => setPrefs({ floor })}
            label={(floor) => `${floor}%`}
            ariaLabel="Battery level to stop at"
            panelWidth={120}
            triggerClassName="w-24"
          />
        </SettingsRow>
      )}
    </SettingsSection>
  );
}
