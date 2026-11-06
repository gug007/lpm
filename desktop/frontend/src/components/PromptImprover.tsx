import { useState } from "react";
import { useAIPicker } from "../hooks/useAIPicker";
import { type ComposerAction } from "../store/composerActions";
import { rewriteWithAction } from "../composerVariants";
import { useAIGeneration } from "../hooks/useAIGeneration";
import { useGeneratorsStore, usePromptActions, useEnabledPromptActions } from "../store/generators";
import { DEFAULT_GENERATOR_PROMPT_ACTIONS } from "../generatorPromptActions";
import { ComposerActionsButton } from "./ComposerActionsButton";
import { ComposerActionsModal } from "./ComposerActionsModal";
import { ComposerVariantsModal } from "./ComposerVariantsModal";

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
  const gen = useAIGeneration();
  const [manageOpen, setManageOpen] = useState(false);
  const [variants, setVariants] = useState<{ label: string; list: string[] } | null>(null);

  if (!ai.anyAvailable) return null;

  const runAction = async (action: ComposerAction, count = 1) => {
    if (gen.generating || !value.trim()) return;
    await rewriteWithAction({
      gen,
      projectName: null,
      cwd: ".",
      ai,
      action,
      value,
      count,
      onText: onChange,
      onVariants: (list) => setVariants({ label: action.label, list }),
    });
  };

  return (
    <>
      <ComposerActionsButton
        enabledActions={enabledActions}
        busy={gen.generating}
        onStop={gen.cancel}
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
      <ComposerVariantsModal
        open={variants !== null}
        actionLabel={variants?.label ?? ""}
        variants={variants?.list ?? []}
        onChoose={(text) => {
          onChange(text);
          setVariants(null);
        }}
        onClose={() => setVariants(null)}
      />
    </>
  );
}
