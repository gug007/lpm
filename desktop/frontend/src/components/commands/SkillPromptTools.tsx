import { useEffect, useRef, useState } from "react";
import { composerValueToText } from "../../composerValue";
import { rewriteWithAction } from "../../composerVariants";
import { useAIPicker } from "../../hooks/useAIPicker";
import type { AIGeneration } from "../../hooks/useAIGeneration";
import { useAppStore } from "../../store/app";
import { useEnabledComposerActions, type ComposerAction } from "../../store/composerActions";
import { ComposerActionsButton } from "../ComposerActionsButton";
import { ComposerActionsModal } from "../ComposerActionsModal";
import { ComposerVariantsModal } from "../ComposerVariantsModal";
import { TerminalHistoryButton } from "../TerminalHistoryButton";

interface SkillPromptToolsProps {
  projectName: string;
  projectLabel: string;
  value: string;
  onReplace: (text: string) => void;
  gen: AIGeneration;
}

function historyText(text: string, images: Record<string, string>): string {
  return composerValueToText({
    text,
    images: Object.entries(images).map(([token, path]) => ({ token: Number(token), path })),
    pending: false,
  });
}

// The row under a skill's prompt, like the one under an agent's input: Refine
// with AI rewrites the prompt with a composer action, Recent messages starts it
// from a message sent before.
export function SkillPromptTools({
  projectName,
  projectLabel,
  value,
  onReplace,
  gen,
}: SkillPromptToolsProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const root = useAppStore((s) => s.projects.find((p) => p.name === projectName)?.root);
  const ai = useAIPicker(!!root, projectName);
  const enabledActions = useEnabledComposerActions();
  const [manageOpen, setManageOpen] = useState(false);
  const [variants, setVariants] = useState<{ label: string; list: string[] } | null>(null);

  // Opening another skill mid-rewrite drops the rewrite instead of landing it there.
  useEffect(() => gen.cancel, [gen.cancel]);

  const runAction = async (action: ComposerAction, count: number) => {
    if (gen.generating || !root || !value.trim()) return;
    await rewriteWithAction({
      gen,
      projectName,
      cwd: root,
      ai,
      action,
      value,
      count,
      onText: onReplace,
      onVariants: (list) => setVariants({ label: action.label, list }),
    });
  };

  return (
    <div ref={rowRef} className="flex shrink-0 items-center gap-0.5 px-1.5 pb-1.5">
      {root && ai.anyAvailable && (
        <ComposerActionsButton
          align="left"
          enabledActions={enabledActions}
          busy={gen.generating}
          onStop={gen.cancel}
          canRun={value.trim().length > 0}
          cliLabel={ai.cliLabel}
          onRun={(action, count) => void runAction(action, count)}
          onManage={() => setManageOpen(true)}
        />
      )}
      <TerminalHistoryButton
        terminalId={projectName}
        projectName={projectName}
        terminalLabel={projectLabel}
        boxRef={rowRef}
        onPick={(text, images) => onReplace(historyText(text, images))}
      />
      <ComposerActionsModal open={manageOpen} onClose={() => setManageOpen(false)} />
      <ComposerVariantsModal
        open={variants !== null}
        actionLabel={variants?.label ?? ""}
        variants={variants?.list ?? []}
        onChoose={(text) => {
          onReplace(text);
          setVariants(null);
        }}
        onClose={() => setVariants(null)}
      />
    </div>
  );
}
