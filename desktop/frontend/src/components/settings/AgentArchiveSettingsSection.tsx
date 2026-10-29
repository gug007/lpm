import { rowProps } from "../../settings-registry";
import { DEFAULT_SEEN_SHOWN, SEEN_SHOWN_MAX, SEEN_SHOWN_MIN } from "../../store/settings";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { Toggle } from "../ui/Toggle";
import { ArchiveAfterControl } from "./ArchiveAfterControl";
import { StepperControl } from "./StepperControl";
import { useRowReach, useSettingsTarget } from "./settingsTarget";

export function AgentArchiveSettingsSection() {
  const { settings, update } = useSettingsTarget();
  const shows = useRowReach();
  const keep = settings.keepFinishedAgents ?? false;
  const shown = settings.seenAgentsShown ?? DEFAULT_SEEN_SHOWN;

  if (!shows("general.keepFinishedAgents") && !shows("general.autoArchiveAgents") && !shows("general.seenAgentsShown")) {
    return null;
  }

  return (
    <SettingsSection title="In the sidebar">
      {shows("general.keepFinishedAgents") && (
        <SettingsRow
          {...rowProps("general.keepFinishedAgents")}
          details={
            <>
              <p>
                On: a finished agent stays in the sidebar, muted once you've opened it, until you
                archive it or close its tab.
              </p>
              <p>
                Off: opening a finished agent removes its row, as before. Archive stays in the row's
                menu either way.
              </p>
            </>
          }
        >
          <Toggle
            aria-label="Keep finished agents until archived"
            enabled={keep}
            onChange={(v) => void update({ keepFinishedAgents: v })}
          />
        </SettingsRow>
      )}
      {keep && shows("general.autoArchiveAgents") && (
        <SettingsRow {...rowProps("general.autoArchiveAgents")} nested>
          <ArchiveAfterControl
            value={settings.autoArchiveAgentsAfter}
            onChange={(value) => void update({ autoArchiveAgentsAfter: value })}
          />
        </SettingsRow>
      )}
      {keep && shows("general.seenAgentsShown") && (
        <SettingsRow {...rowProps("general.seenAgentsShown")} nested>
          <StepperControl
            value={String(shown)}
            label="seen agents per project"
            canDecrease={shown > SEEN_SHOWN_MIN}
            canIncrease={shown < SEEN_SHOWN_MAX}
            onDecrease={() => void update({ seenAgentsShown: shown - 1 })}
            onIncrease={() => void update({ seenAgentsShown: shown + 1 })}
          />
        </SettingsRow>
      )}
    </SettingsSection>
  );
}
