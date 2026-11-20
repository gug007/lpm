import { useCallback, useEffect, useState } from "react";
import {
  capitalized,
  DAILY_LIMITS,
  limitLabel,
  type GenerateKeys,
  type GenerateOptions,
} from "../../generate";
import { rowProps } from "../../settings-registry";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { SettingsSelect } from "../SettingsSelect";
import { Toggle } from "../ui/Toggle";
import { GenerateApprovalRow } from "./GenerateApprovalRow";
import { GenerateKeyRow } from "./GenerateKeyRow";
import { GenerateUsageRow } from "./GenerateUsageRow";
import { useSettingsTarget } from "./settingsTarget";

// Settings › Images & speech: the keys `lpm generate` uses, when it asks first,
// and what it makes by default.
export function GeneratePane() {
  const { settings, update, commands } = useSettingsTarget();
  const [keys, setKeys] = useState<GenerateKeys | null>(null);
  const [options, setOptions] = useState<GenerateOptions | null>(null);

  const loadKeys = useCallback(() => {
    commands.generate
      .keys()
      .then(setKeys)
      .catch(() => setKeys({ gemini: false, openai: false }));
  }, [commands]);

  useEffect(() => {
    loadKeys();
    commands.generate
      .options()
      .then(setOptions)
      .catch(() => setOptions(null));
  }, [commands, loadKeys]);

  const limit = settings.generateDailyLimit ?? options?.defaultLimit ?? 2;
  const limits = DAILY_LIMITS.includes(limit) ? DAILY_LIMITS : [...DAILY_LIMITS, limit];
  const imageModel = settings.generateImageModel ?? options?.defaultImageModel ?? "nano-banana";
  const voice = settings.generateVoice ?? options?.defaultVoice ?? "marin";

  return (
    <>
      <SettingsSection
        title="Keys"
        description="Each key stays on this computer. Agents ask lpm for the file and never see the key."
      >
        <GenerateKeyRow
          id="generate.geminiKey"
          provider="gemini"
          placeholder="Paste key"
          saved={keys ? keys.gemini : null}
          onChange={loadKeys}
        />
        <GenerateKeyRow
          id="generate.openaiKey"
          provider="openai"
          placeholder="sk-…"
          saved={keys ? keys.openai : null}
          onChange={loadKeys}
        />
      </SettingsSection>

      <SettingsSection title="When an agent asks">
        <GenerateApprovalRow />
        <SettingsRow {...rowProps("generate.dailyLimit")}>
          <SettingsSelect
            value={String(limit)}
            onChange={(e) => void update({ generateDailyLimit: Number(e.target.value) })}
            aria-label="Daily limit"
          >
            {limits.map((dollars) => (
              <option key={dollars} value={String(dollars)}>
                {limitLabel(dollars)}
              </option>
            ))}
          </SettingsSelect>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Defaults">
        <SettingsRow {...rowProps("generate.imageModel")}>
          <SettingsSelect
            value={imageModel}
            onChange={(e) => void update({ generateImageModel: e.target.value })}
            aria-label="Image model"
          >
            {(options?.imageModels ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {`${m.label} · ${m.provider}`}
              </option>
            ))}
          </SettingsSelect>
        </SettingsRow>
        <SettingsRow {...rowProps("generate.voice")}>
          <SettingsSelect
            value={voice}
            onChange={(e) => void update({ generateVoice: e.target.value })}
            aria-label="Voice"
          >
            {(options?.voices ?? [voice]).map((v) => (
              <option key={v} value={v}>
                {capitalized(v)}
              </option>
            ))}
          </SettingsSelect>
        </SettingsRow>
        <SettingsRow {...rowProps("generate.keepOutOfGit")}>
          <Toggle
            enabled={settings.generateKeepOutOfGit !== false}
            onChange={(on) => void update({ generateKeepOutOfGit: on })}
            aria-label="Keep generated/ out of Git"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Usage">
        <GenerateUsageRow />
      </SettingsSection>
    </>
  );
}
