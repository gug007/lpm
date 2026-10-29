import { clampEffort } from "../../hooks/useAIPicker";
import { rowProps } from "../../settings-registry";
import {
  AI_CLI_OPTIONS,
  aiDefaultModel,
  aiEffectiveEffort,
  aiEfforts,
  aiSupportsFast,
  type AICLI,
} from "../../types";
import { SettingsRow } from "../SettingsRow";
import { SettingsSelect } from "../SettingsSelect";
import { SettingsCheckbox } from "./SettingsCheckbox";
import { useSettingsTarget } from "./settingsTarget";
import { useAIModelPick } from "./useAIModelPick";
import { useMachineWords } from "./useMachineWords";

// Settings › Agents › lpm's AI: the agent, model and effort the Commit, PR and
// branch windows open with, and prompt improvement uses.
export function AIModelSettingsRow() {
  const { settings, update } = useSettingsTarget();
  const { thisMachine } = useMachineWords();
  const { cli, model, available } = useAIModelPick();
  const savedEffort = settings.aiEffort ?? "";
  const models = AI_CLI_OPTIONS.find((o) => o.value === cli)?.models ?? [];
  const efforts = aiEfforts(cli, model);
  const noneInstalled = available !== null && !AI_CLI_OPTIONS.some((o) => available[o.value]);

  const choose = (nextCli: AICLI, nextModel: string) =>
    void update({
      aiCli: nextCli,
      aiModel: nextModel || undefined,
      aiEffort: clampEffort(nextCli, nextModel, savedEffort) || undefined,
    });
  const chooseEffort = (effort: string) =>
    void update({ aiCli: cli, aiModel: model || undefined, aiEffort: effort || undefined });
  const chooseFast = (fast: boolean) => void update({ aiCli: cli, aiModel: model || undefined, aiFast: fast });

  return (
    <SettingsRow
      {...rowProps("git.aiModel")}
      below={
        noneInstalled ? (
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
            No agent CLI is installed on {thisMachine}
          </p>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
        <SettingsSelect
          aria-label="Agent"
          value={cli}
          onChange={(e) => {
            const next = e.target.value as AICLI;
            choose(next, aiDefaultModel(next));
          }}
        >
          {AI_CLI_OPTIONS.map((o) => {
            const missing = available?.[o.value] === false;
            return (
              <option key={o.value} value={o.value} disabled={missing}>
                {missing ? `${o.label} (not installed)` : o.label}
              </option>
            );
          })}
        </SettingsSelect>
        {models.length > 0 && (
          <SettingsSelect aria-label="Model" value={model} onChange={(e) => choose(cli, e.target.value)}>
            {models.map((m) => (
              <option key={m.value || "default"} value={m.value}>
                {m.value ? m.label : "Default model"}
              </option>
            ))}
          </SettingsSelect>
        )}
        {efforts.length > 0 && (
          <SettingsSelect
            aria-label="Effort"
            value={aiEffectiveEffort(cli, model, savedEffort)}
            onChange={(e) => chooseEffort(e.target.value)}
          >
            {efforts.map((e) => (
              <option key={e.value || "default"} value={e.value}>
                {e.value ? `${e.label} effort` : "Default effort"}
              </option>
            ))}
          </SettingsSelect>
        )}
        {aiSupportsFast(cli, model) && (
          <SettingsCheckbox label="Fast mode" checked={settings.aiFast ?? false} onChange={chooseFast} />
        )}
      </div>
    </SettingsRow>
  );
}
