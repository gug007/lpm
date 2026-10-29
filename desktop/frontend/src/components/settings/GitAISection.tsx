import { rowProps } from "../../settings-registry";
import type { View } from "../../store/app";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { BTN_SECONDARY } from "../ui/buttons";
import { Toggle } from "../ui/Toggle";
import { AIModelSettingsRow } from "./AIModelSettingsRow";
import { useRowReach, useSettingsTarget } from "./settingsTarget";

export function GitAISection({ onNavigate }: { onNavigate: (view: View) => void }) {
  const { settings, update } = useSettingsTarget();
  const shows = useRowReach();

  return (
    <SettingsSection title="Written by AI">
      {shows("git.aiModel") && <AIModelSettingsRow />}
      {shows("git.autoCommitMessage") && (
        <SettingsRow {...rowProps("git.autoCommitMessage")}>
          <Toggle
            aria-label="Write commit messages on open"
            enabled={settings.autoGenerateCommitMessage ?? false}
            onChange={(v) => void update({ autoGenerateCommitMessage: v })}
          />
        </SettingsRow>
      )}
      {shows("git.autoPrDescription") && (
        <SettingsRow {...rowProps("git.autoPrDescription")}>
          <Toggle
            aria-label="Write PR descriptions on open"
            enabled={settings.autoGeneratePRDescription ?? false}
            onChange={(v) => void update({ autoGeneratePRDescription: v })}
          />
        </SettingsRow>
      )}
      {shows("ai.commitInstructions") && (
        <SettingsRow {...rowProps("ai.commitInstructions")}>
          <button onClick={() => onNavigate("commit-instructions")} className={BTN_SECONDARY}>
            Edit
          </button>
        </SettingsRow>
      )}
      {shows("ai.prInstructions") && (
        <SettingsRow {...rowProps("ai.prInstructions")}>
          <button onClick={() => onNavigate("pr-instructions")} className={BTN_SECONDARY}>
            Edit
          </button>
        </SettingsRow>
      )}
      {shows("ai.branchInstructions") && (
        <SettingsRow {...rowProps("ai.branchInstructions")}>
          <button onClick={() => onNavigate("branch-instructions")} className={BTN_SECONDARY}>
            Edit
          </button>
        </SettingsRow>
      )}
    </SettingsSection>
  );
}
