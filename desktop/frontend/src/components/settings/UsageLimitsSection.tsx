import { useState } from "react";
import { rowProps, type SettingsRowId } from "../../settings-registry";
import { USAGE_TOOLS } from "../../sidebarUsage";
import { useAppStore } from "../../store/app";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { BTN_SECONDARY } from "../ui/buttons";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Toggle } from "../ui/Toggle";
import {
  toggledUsageTool,
  USAGE_WINDOW_OPTIONS,
  usageSidebarTools,
  usageSidebarWindow,
} from "../usageSidebarSettings";
import { UsageToolChip } from "../UsageToolChip";
import { useRowReach, useSettingsTarget } from "./settingsTarget";
import { useClaudeReadings } from "./useClaudeReadings";

const ROW_IDS: SettingsRowId[] = [
  "accounts.readClaudeUsage",
  "accounts.sidebarUsage",
  "accounts.sidebarUsageTools",
  "accounts.sidebarUsageWindow",
  "usage",
];

// Settings › Accounts & usage › Usage limits: whether lpm reads Claude's limits,
// the sidebar meter (mirroring the Usage window's own controls), and the Usage
// window itself.
export function UsageLimitsSection() {
  const shows = useRowReach();
  const { settings, update } = useSettingsTarget();
  const setReadings = useClaudeReadings();
  const setUsageOpen = useAppStore((s) => s.setUsageOpen);
  const [savingReadings, setSavingReadings] = useState(false);
  const meter = settings.usageInSidebar ?? true;
  const tools = usageSidebarTools(settings);

  if (!ROW_IDS.some(shows)) return null;

  const toggleReadings = async (enabled: boolean) => {
    setSavingReadings(true);
    try {
      await setReadings(enabled);
    } finally {
      setSavingReadings(false);
    }
  };

  return (
    <SettingsSection title="Usage limits">
      {shows("accounts.readClaudeUsage") && (
        <SettingsRow {...rowProps("accounts.readClaudeUsage")}>
          <Toggle
            aria-label="Read Claude usage"
            enabled={settings.claudeLimitsEnabled ?? false}
            disabled={savingReadings}
            onChange={(v) => void toggleReadings(v)}
          />
        </SettingsRow>
      )}
      {shows("accounts.sidebarUsage") && (
        <SettingsRow {...rowProps("accounts.sidebarUsage")}>
          <Toggle
            aria-label="Show usage in the sidebar"
            enabled={meter}
            onChange={(v) => void update({ usageInSidebar: v })}
          />
        </SettingsRow>
      )}
      {meter && shows("accounts.sidebarUsageTools") && (
        <SettingsRow {...rowProps("accounts.sidebarUsageTools")} nested>
          <div role="group" aria-label="Tools in the meter" className="flex gap-2">
            {USAGE_TOOLS.map((provider) => (
              <UsageToolChip
                key={provider}
                provider={provider}
                on={tools.includes(provider)}
                onToggle={() => void update({ usageSidebarTools: toggledUsageTool(tools, provider) })}
              />
            ))}
          </div>
        </SettingsRow>
      )}
      {meter && shows("accounts.sidebarUsageWindow") && (
        <SettingsRow {...rowProps("accounts.sidebarUsageWindow")} nested>
          <SegmentedControl
            value={usageSidebarWindow(settings)}
            options={USAGE_WINDOW_OPTIONS}
            ariaLabel="Limit in the meter"
            onChange={(value) => void update({ usageSidebarWindow: value })}
          />
        </SettingsRow>
      )}
      {shows("usage") && (
        <SettingsRow {...rowProps("usage")}>
          <button onClick={() => setUsageOpen(true)} className={BTN_SECONDARY}>
            Open
          </button>
        </SettingsRow>
      )}
    </SettingsSection>
  );
}
