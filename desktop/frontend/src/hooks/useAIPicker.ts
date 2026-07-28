import { useCallback, useEffect, useState } from "react";
import { CheckAICLIs } from "../../bridge/commands";
import {
  AI_CLI_OPTIONS,
  aiDefaultModel,
  aiEffectiveEffort,
  aiEfforts,
  aiPickLabel,
  resolveAIPick,
  type AICLI,
} from "../types";
import { getSettings, saveSettings } from "../store/settings";

const DEFAULT_CLI: AICLI = "claude";

// Switching model drops an effort the new one can't take — Codex's top levels
// are model-bound. CLIs with no effort control at all keep it parked so hopping
// through one doesn't lose the setting.
function clampEffort(cli: AICLI, model: string, effort: string): string {
  if (aiEfforts(cli, model).length === 0) return effort;
  return aiEffectiveEffort(cli, model, effort);
}

export interface AIPicker {
  aiCLIs: Record<string, boolean>;
  anyAvailable: boolean;
  selectedCLI: AICLI;
  selectedModel: string;
  selectedEffort: string;
  selectedFast: boolean;
  cliLabel: string;
  selectAI: (cli: AICLI, model: string) => void;
  selectEffort: (cli: AICLI, effort: string) => void;
  selectFast: (cli: AICLI, fast: boolean) => void;
}

// Pass `active` true once the consumer is visible so the CLI availability
// check only fires while it matters.
export function useAIPicker(active: boolean): AIPicker {
  const [aiCLIs, setAiCLIs] = useState<Record<string, boolean>>({});
  const [selectedCLI, setSelectedCLI] = useState<AICLI>(
    () => (getSettings().aiCli as AICLI) || DEFAULT_CLI,
  );
  const [selectedModel, setSelectedModel] = useState<string>(
    () => getSettings().aiModel ?? aiDefaultModel(DEFAULT_CLI),
  );
  const [selectedEffort, setSelectedEffort] = useState<string>(
    () => getSettings().aiEffort ?? "",
  );
  const [selectedFast, setSelectedFast] = useState<boolean>(
    () => getSettings().aiFast ?? false,
  );

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    CheckAICLIs()
      .then((a) => {
        if (cancelled) return;
        const avail: Record<string, boolean> = {
          claude: a.claude,
          codex: a.codex,
          gemini: a.gemini,
          opencode: a.opencode,
        };
        setAiCLIs(avail);
        const s = getSettings();
        const pick = resolveAIPick(s.aiCli, s.aiModel, avail);
        if (pick) {
          setSelectedCLI(pick.cli);
          setSelectedModel(pick.model);
          setSelectedEffort((prev) => clampEffort(pick.cli, pick.model, prev));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [active]);

  const selectAI = useCallback(
    (cli: AICLI, model: string) => {
      setSelectedCLI(cli);
      setSelectedModel(model);
      const effort = clampEffort(cli, model, selectedEffort);
      setSelectedEffort(effort);
      saveSettings({ aiCli: cli, aiModel: model, aiEffort: effort });
    },
    [selectedEffort],
  );

  const selectEffort = useCallback((cli: AICLI, effort: string) => {
    setSelectedCLI(cli);
    setSelectedEffort(effort);
    saveSettings({ aiCli: cli, aiEffort: effort });
  }, []);

  const selectFast = useCallback((cli: AICLI, fast: boolean) => {
    setSelectedCLI(cli);
    setSelectedFast(fast);
    saveSettings({ aiCli: cli, aiFast: fast });
  }, []);

  return {
    aiCLIs,
    anyAvailable: AI_CLI_OPTIONS.some((o) => aiCLIs[o.value]),
    selectedCLI,
    selectedModel,
    selectedEffort,
    selectedFast,
    cliLabel: aiPickLabel(selectedCLI, selectedModel),
    selectAI,
    selectEffort,
    selectFast,
  };
}
