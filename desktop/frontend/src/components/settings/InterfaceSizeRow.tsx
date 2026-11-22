import { INTERFACE_SIZES, interfaceSizeLabel, interfaceSizeOf } from "../../interfaceSize";
import { rowProps } from "../../settings-registry";
import { SettingsRow } from "../SettingsRow";
import { SegmentButton } from "./SegmentButton";
import { useSettingsTarget } from "./settingsTarget";

/** How big lpm draws its own pages on this computer, applied at once. */
export function InterfaceSizeRow() {
  const { settings, update } = useSettingsTarget();
  const size = interfaceSizeOf(settings.interfaceSize);
  return (
    <SettingsRow {...rowProps("general.interfaceSize")}>
      <div className="flex rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-0.5">
        {INTERFACE_SIZES.map((option) => (
          <SegmentButton
            key={option}
            label={interfaceSizeLabel(option)}
            active={size === option}
            onClick={() => void update({ interfaceSize: option })}
          />
        ))}
      </div>
    </SettingsRow>
  );
}
