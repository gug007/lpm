import { useState } from "react";
import { toast } from "../toast";
import { TransformText } from "../../bridge/commands";
import { useAIPicker } from "../hooks/useAIPicker";
import { type ComposerAction } from "../store/composerActions";
import { generateVariants, resolveTransformParams } from "../composerVariants";
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [variants, setVariants] = useState<{ label: string; list: string[] } | null>(null);

  if (!ai.anyAvailable) return null;

  const runAction = async (action: ComposerAction, count = 1) => {
    if (busyId || !value.trim()) return;
    setBusyId(action.id);
    try {
      const params = resolveTransformParams(ai);
      if (count <= 1) {
        const out = await TransformText(
          null,
          ".",
          params.cli,
          params.model,
          params.effort,
          params.fast,
          action.instruction,
          value,
        );
        const text = typeof out === "string" ? out.trim() : "";
        if (!text) {
          toast.error("AI returned an empty response");
          return;
        }
        onChange(text);
      } else {
        const list = await generateVariants(null, ".", params, action.instruction, value, count);
        if (list.length === 0) {
          toast.error("AI returned an empty response");
          return;
        }
        setVariants({ label: action.label, list });
      }
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
