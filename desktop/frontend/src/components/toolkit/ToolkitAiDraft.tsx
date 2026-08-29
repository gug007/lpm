import { useEffect, useState } from "react";
import { ChevronUp, WandSparkles } from "lucide-react";
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

// The collapsed row reads as the dialog's other collapsed answer does — the
// same hairline, radius and focus ring as an OptionSelect trigger — so the
// shortcut sits in the form rather than on top of it.
const BAR =
  "flex w-full min-w-0 items-center gap-2 rounded-[var(--tk-radius-s)] px-2 py-1.5 text-left shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text-primary)_16%,transparent)] transition-[background-color,box-shadow] hover:bg-[var(--tk-hover)] focus:outline-none focus-visible:outline-[1.5px] focus-visible:outline-offset-[2px] focus-visible:outline-[var(--text-primary)]";

const PLATE =
  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] text-[var(--text-primary)]";

const CHIP =
  "shrink-0 rounded-full px-2.5 py-[3px] text-[11px] text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text-primary)_16%,transparent)]";

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
  const [expanded, setExpanded] = useState(false);
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
      ? ""
      : "Install an AI coding CLI to use this.";

  // Collapsed, the shortcut costs one row instead of a quarter of the dialog —
  // the form below it is what most skills are written in. Anything already
  // described stays the row's label rather than disappearing behind it.
  if (!expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)} className={BAR}>
        <span className={PLATE}>
          <WandSparkles size={12} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-muted)]">
          {described || "Describe it and let AI draft the fields"}
        </span>
        <span className={CHIP}>Draft</span>
      </button>
    );
  }

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
        <span className={PLATE}>
          <WandSparkles size={12} />
        </span>
        <span className="text-[11.5px] font-medium text-[var(--text-primary)]">
          Draft it with AI
        </span>
        {/* A running draft reports into the composer's footer, so putting it
            away mid-run would hide the only sign it is working. */}
        {!generation.generating && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            title="Put it away"
            aria-label="Put the AI drafter away"
            className="ml-auto rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--tk-hover)] hover:text-[var(--text-primary)]"
          >
            <ChevronUp size={12} />
          </button>
        )}
      </div>
      <InputComposer
        autoFocus
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
