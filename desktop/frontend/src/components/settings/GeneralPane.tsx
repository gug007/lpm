import { Monitor, Moon, Sun } from "lucide-react";
import { rowProps } from "../../settings-registry";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { Toggle } from "../ui/Toggle";
import { AboutSection } from "./AboutSection";
import { AgentArchiveSettingsSection } from "./AgentArchiveSettingsSection";
import { AutoPullSettingsRow } from "./AutoPullSettingsRow";
import { DefaultDirectoryRow } from "./DefaultDirectoryRow";
import { PeerAboutSection } from "./PeerAboutSection";
import { SegmentButton } from "./SegmentButton";
import { useRowReach, useSettingsTarget } from "./settingsTarget";

const THEMES = [
  { theme: "light", label: "Light", Icon: Sun },
  { theme: "dark", label: "Dark", Icon: Moon },
  { theme: "system", label: "System", Icon: Monitor },
] as const;

export function GeneralPane() {
  const { machine, settings, update } = useSettingsTarget();
  const shows = useRowReach();

  return (
    <>
      <SettingsSection>
        {shows("general.theme") && (
          <SettingsRow {...rowProps("general.theme")}>
            <div className="flex rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-0.5">
              {THEMES.map(({ theme, label, Icon }) => (
                <SegmentButton
                  key={theme}
                  label={label}
                  icon={<Icon size={12} strokeWidth={2} />}
                  active={settings.theme === theme}
                  onClick={() => void update({ theme })}
                />
              ))}
            </div>
          </SettingsRow>
        )}
        {shows("general.doubleClick") && (
          <SettingsRow {...rowProps("general.doubleClick")}>
            <Toggle
              aria-label="Double-click to start/stop"
              enabled={settings.doubleClickToToggle}
              onChange={(v) => void update({ doubleClickToToggle: v })}
            />
          </SettingsRow>
        )}
        <SettingsRow {...rowProps("general.checkOrigin")}>
          <Toggle
            aria-label="Check for new commits"
            enabled={settings.checkOrigin ?? true}
            onChange={(v) => void update({ checkOrigin: v })}
          />
        </SettingsRow>
        <AutoPullSettingsRow />
        <DefaultDirectoryRow />
      </SettingsSection>

      <AgentArchiveSettingsSection />

      {machine.kind === "local" ? <AboutSection /> : <PeerAboutSection version={machine.version} />}
    </>
  );
}
