import { useEffect, useRef, useState } from "react";
import { WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { GenerateClaudeStatusline } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { useAIPicker } from "../hooks/useAIPicker";
import { useAIGeneration, isCanceledError } from "../hooks/useAIGeneration";
import { aiEffectiveFast } from "../types";
import { AIPickerButton } from "./ui/AIPickerButton";

export function AiRefineBar({
  selection,
  initialDescription,
  disabled,
  onGenerated,
}: {
  selection: unknown;
  initialDescription: string;
  disabled: boolean;
  onGenerated: () => void;
}) {
  const [description, setDescription] = useState(initialDescription);
  const [progress, setProgress] = useState("");
  const focused = useRef(false);
  const ai = useAIPicker(true);
  const generation = useAIGeneration();

  useEffect(() => {
    if (!focused.current) setDescription(initialDescription);
  }, [initialDescription]);

  useEffect(() => {
    if (!generation.generating) return;
    const off = EventsOn("statusline-gen-progress", (line: string) => {
      if (typeof line === "string" && line.trim()) setProgress(line.trim());
    });
    return () => {
      off?.();
    };
  }, [generation.generating]);

  const generate = async () => {
    const prompt = description.trim();
    if (!prompt || !ai.anyAvailable || disabled) return;
    setProgress("");
    try {
      await generation.run((generationId) =>
        GenerateClaudeStatusline(
          ai.selectedCLI,
          ai.selectedModel,
          ai.selectedEffort,
          aiEffectiveFast(ai.selectedCLI, ai.selectedModel, ai.selectedFast),
          selection,
          prompt,
          generationId,
        ),
      );
      setProgress("");
      onGenerated();
    } catch (error) {
      if (!isCanceledError(error)) toast.error(String(error));
    }
  };

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/20 p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-purple-500/10 text-purple-500">
          <WandSparkles size={13} />
        </span>
        <h2 className="text-[11.5px] font-semibold text-[var(--text-primary)]">
          Refine with AI
        </h2>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] transition-[border-color,box-shadow] focus-within:border-purple-500/45 focus-within:ring-2 focus-within:ring-purple-500/10">
        <textarea
          value={description}
          rows={2}
          onChange={(event) => setDescription(event.target.value)}
          onFocus={() => (focused.current = true)}
          onBlur={() => (focused.current = false)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey) &&
              !generation.generating &&
              ai.anyAvailable &&
              !disabled
            ) {
              event.preventDefault();
              void generate();
            }
          }}
          disabled={disabled || generation.generating || !ai.anyAvailable}
          aria-label="Describe an AI status line change"
          placeholder="Describe the change you want…"
          className="block min-h-[60px] w-full resize-none rounded-t-xl bg-transparent px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]/70 disabled:opacity-60"
        />
        <div className="flex min-h-10 items-center justify-between gap-3 border-t border-[var(--border)] px-2.5 py-1.5">
          <span
            aria-live="polite"
            className="min-w-0 truncate text-[9.5px] text-[var(--text-muted)]"
          >
            {generation.generating
              ? progress || "Generating your change…"
              : disabled
                ? "Load your status line to use AI."
                : ai.anyAvailable
                  ? "⌘ Enter to refine"
                  : "Install an AI coding CLI to use this"}
          </span>
          {ai.anyAvailable && (
            <AIPickerButton
              onGenerate={() => void generate()}
              onCancel={generation.cancel}
              generating={generation.generating}
              disabled={disabled || !description.trim()}
              label="Refine"
              generatingLabel="Generating…"
              title="Refine the status line with AI"
              aiCLIs={ai.aiCLIs}
              selectedCLI={ai.selectedCLI}
              selectedModel={ai.selectedModel}
              selectedEffort={ai.selectedEffort}
              selectedFast={ai.selectedFast}
              onSelect={ai.selectAI}
              onSelectEffort={ai.selectEffort}
              onSelectFast={ai.selectFast}
              menuPlacement="up"
            />
          )}
        </div>
      </div>
    </section>
  );
}
