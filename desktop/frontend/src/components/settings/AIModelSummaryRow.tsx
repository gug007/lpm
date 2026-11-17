import { ROWS, TAB_TITLES } from "../../settings-registry";
import { AI_CLI_OPTIONS, aiEffectiveEffort, aiEfforts, aiSupportsFast } from "../../types";
import { SettingsRow } from "../SettingsRow";
import { useAppStore } from "../../store/app";
import { BTN_SECONDARY } from "../ui/buttons";
import { revealSettingsRow } from "./revealSettingsRow";
import { useSettingsTarget } from "./settingsTarget";
import { useAIModelPick } from "./useAIModelPick";

// Settings › Git › Written by AI: which agent and model write here. They're
// chosen in Settings › Agents, since prompt improvement uses them too.
export function AIModelSummaryRow() {
  const { settings } = useSettingsTarget();
  const { cli, model } = useAIModelPick();
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);
  const option = AI_CLI_OPTIONS.find((o) => o.value === cli);
  const models = option?.models ?? [];
  const efforts = aiEfforts(cli, model);
  const effort = efforts.find((e) => e.value === aiEffectiveEffort(cli, model, settings.aiEffort ?? ""));

  const parts = [option?.label ?? cli];
  if (models.length > 0) parts.push((model && models.find((m) => m.value === model)?.label) || "Default model");
  if (efforts.length > 0) parts.push(effort?.value ? `${effort.label} effort` : "Default effort");
  if (aiSupportsFast(cli, model) && settings.aiFast) parts.push("Fast mode");

  return (
    <SettingsRow label={ROWS["git.aiModel"].label} description={parts.join(" · ")}>
      <button
        type="button"
        onClick={() => {
          setSettingsTab("agents");
          revealSettingsRow("git.aiModel");
        }}
        className={BTN_SECONDARY}
      >
        Change in {TAB_TITLES.agents}
      </button>
    </SettingsRow>
  );
}
