import { rowProps } from "../../settings-registry";
import type { View } from "../../store/app";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { Toggle } from "../ui/Toggle";
import { AutoPullSettingsRow } from "./AutoPullSettingsRow";
import { GitAISection } from "./GitAISection";
import { GitCommandsSection } from "./GitCommandsSection";
import { useRowReach, useSettingsTarget } from "./settingsTarget";

export function GitPane({ onNavigate }: { onNavigate: (view: View) => void }) {
  const { settings, update } = useSettingsTarget();
  const shows = useRowReach();

  return (
    <>
      <SettingsSection title="New commits">
        {shows("general.checkOrigin") && (
          <SettingsRow {...rowProps("general.checkOrigin")}>
            <Toggle
              aria-label="Check for new commits"
              enabled={settings.checkOrigin ?? true}
              onChange={(v) => void update({ checkOrigin: v })}
            />
          </SettingsRow>
        )}
        {shows("general.autoPull") && <AutoPullSettingsRow />}
      </SettingsSection>

      <GitCommandsSection />

      <GitAISection onNavigate={onNavigate} />
    </>
  );
}
