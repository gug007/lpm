import { useEffect, useState } from "react";
import { WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { GenerateAgentSkill } from "../../../bridge/commands";
import { EventsOn } from "../../../bridge/runtime";
import { composerValueToText, type ComposerValue } from "../../composerValue";
import { isCanceledError, useAIGeneration } from "../../hooks/useAIGeneration";
import { useAIPicker } from "../../hooks/useAIPicker";
import { aiEffectiveFast } from "../../types";
import { InputComposer } from "../InputComposer";
import { AIPickerButton } from "../ui/AIPickerButton";

export interface SkillDraft {
  name: string;
  description: string;
  body: string;
}

interface ToolkitAiDraftProps {
  cwd: string;
  // What the user already typed into the name field, offered to the model as
  // a suggestion rather than lost to the draft.
  nameHint: string;
  // Owned by the parent so the sub-view's discard guard covers a half-written
  // request too, not only the form fields below.
  request: ComposerValue;
  onRequest: (value: ComposerValue) => void;
  onDraft: (draft: SkillDraft) => void;
}

// The describe-first path into the form below it: the CLI reads the project for
// context and the form stays the review surface — nothing is written until the
// user has seen every field and pressed Create.
//
// The field is the app's own composer, so describing a skill takes everything
// describing a task already takes: dictation, the prompt actions, and a dropped
// screenshot that arrives as a path the CLI can open.
export function ToolkitAiDraft({
  cwd,
  nameHint,
  request,
  onRequest,
  onDraft,
}: ToolkitAiDraftProps) {
  const [progress, setProgress] = useState("");
  const ai = useAIPicker(true);
  const generation = useAIGeneration();

  useEffect(() => {
    if (!generation.generating) return;
    const off = EventsOn("skill-gen-progress", (line: string) => {
      if (typeof line === "string" && line.trim()) setProgress(line.trim());
    });
    return () => {
      off?.();
    };
  }, [generation.generating]);

  // Closing the sub-view mid-run must reap the CLI, not leave it drafting into
  // a form that no longer exists.
  useEffect(() => () => generation.cancel(), [generation.cancel]);

  // Attachment paths land in the text the way the terminal delivers them, so a
  // pasted screenshot is a path the agent can open rather than a dead token.
  const described = composerValueToText(request).trim();
  const ready = Boolean(described) && !request.pending;

  const generate = async () => {
    if (!ready || !ai.anyAvailable || generation.generating) return;
    setProgress("");
    try {
      const draft = (await generation.run((genId) =>
        GenerateAgentSkill(
          ai.selectedCLI,
          ai.selectedModel,
          ai.selectedEffort,
          aiEffectiveFast(ai.selectedCLI, ai.selectedModel, ai.selectedFast),
          cwd,
          described,
          nameHint,
          genId,
        ),
      )) as SkillDraft;
      setProgress("");
      onDraft(draft);
    } catch (err) {
      if (!isCanceledError(err)) toast.error(String(err));
    }
  };

  const status = generation.generating
    ? progress || "Drafting…"
    : ai.anyAvailable
      ? "Fills in the fields for you to review."
      : "Install an AI coding CLI to use this.";

  return (
    <div
      className="flex flex-col"
      onKeyDown={(e) => {
        // The composer leaves plain Enter to its host and keeps Shift+Enter for
        // a newline. ⌘↩ is caught here too, or it would reach the form and try
        // to create a skill the user is still describing.
        if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
        if (!(e.target as HTMLElement | null)?.isContentEditable) return;
        e.preventDefault();
        e.stopPropagation();
        void generate();
      }}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-purple-500/10 text-purple-500">
          <WandSparkles size={12} />
        </span>
        <span className="text-[11.5px] font-medium text-[var(--text-primary)]">
          Draft it with AI
        </span>
      </div>
      <InputComposer
        defaultValue={request}
        onChange={onRequest}
        placeholder="Describe what the skill should do — it can read this project for context."
        aiCwd={cwd}
        disabled={generation.generating || !ai.anyAvailable}
        footer={
          <>
            <span
              aria-live="polite"
              className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-muted)]"
            >
              {status}
            </span>
            {ai.anyAvailable && (
              <AIPickerButton
                onGenerate={() => void generate()}
                onCancel={generation.cancel}
                generating={generation.generating}
                disabled={!ready}
                label="Draft"
                generatingLabel="Drafting…"
                title="Draft the skill with AI"
                aiCLIs={ai.aiCLIs}
                selectedCLI={ai.selectedCLI}
                selectedModel={ai.selectedModel}
                selectedEffort={ai.selectedEffort}
                selectedFast={ai.selectedFast}
                onSelect={ai.selectAI}
                onSelectEffort={ai.selectEffort}
                onSelectFast={ai.selectFast}
                menuPlacement="down"
              />
            )}
          </>
        }
      />
    </div>
  );
}
