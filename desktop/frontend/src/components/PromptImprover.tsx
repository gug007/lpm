import { useState } from "react";
import { toast } from "sonner";
import { TransformText } from "../../bridge/commands";
import { useAIPicker } from "../hooks/useAIPicker";
import { aiEffectiveFast, type AICLI } from "../types";
import { getSettings } from "../store/settings";
import { type ComposerAction } from "../store/composerActions";
import { useGeneratorsStore, usePromptActions, useEnabledPromptActions } from "../store/generators";
import { DEFAULT_GENERATOR_PROMPT_ACTIONS } from "../generatorPromptActions";
import { ComposerActionsButton } from "./ComposerActionsButton";
import { ComposerActionsModal } from "./ComposerActionsModal";

interface PromptImproverProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

export function PromptImprover({ value, onChange, disabled = false }: PromptImproverProps) {
  const ai = useAIPicker(true);
  const enabledActions = useEnabledPromptActions();
  const promptActions = usePromptActions();
  const savePromptActions = useGeneratorsStore((s) => s.savePromptActions);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  if (!ai.anyAvailable) return null;

  const runAction = async (action: ComposerAction) => {
    if (busyId || !value.trim()) return;
    setBusyId(action.id);
    try {
      const s = getSettings();
      const cli = (s.aiCli as AICLI) || ai.selectedCLI;
      const model = s.aiModel ?? ai.selectedModel;
      const effort = s.aiEffort ?? ai.selectedEffort;
      const fast = s.aiFast ?? ai.selectedFast;
      const out = await TransformText(".", cli, model, effort, aiEffectiveFast(cli, model, fast), action.instruction, value);
      const text = typeof out === "string" ? out.trim() : "";
      if (!text) {
        toast.error("AI returned an empty response");
        return;
      }
      onChange(text);
    } catch (err) {
      toast.error(`Action failed: ${err}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <ComposerActionsButton
        enabledActions={enabledActions}
        busy={busyId !== null}
        canRun={!disabled && value.trim().length > 0}
        cliLabel={ai.cliLabel}
        onRun={runAction}
        onManage={() => setManageOpen(true)}
      />
      <ComposerActionsModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        actions={promptActions}
        onSave={savePromptActions}
        title="Prompt actions"
        zIndexClassName="z-[70]"
        defaultActions={DEFAULT_GENERATOR_PROMPT_ACTIONS}
      />
    </>
  );
}
