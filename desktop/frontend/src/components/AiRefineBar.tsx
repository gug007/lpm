import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { GenerateClaudeStatusline } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { useAIPicker } from "../hooks/useAIPicker";
import { useAIGeneration, isCanceledError } from "../hooks/useAIGeneration";
import { aiEffectiveFast } from "../types";
import { AIPickerButton } from "./ui/AIPickerButton";

// A persistent bar under the preview: change whatever the preview currently
// shows using words. `selection` is the same descriptor the preview uses, so
// the edit builds on the active line (and stacks when that line is AI-made).
export function AiRefineBar({
  selection,
  initialDescription,
  onGenerated,
}: {
  selection: unknown;
  initialDescription: string;
  onGenerated: () => void;
}) {
  const [description, setDescription] = useState(initialDescription);
  const [progress, setProgress] = useState("");
  const focused = useRef(false);
  const ai = useAIPicker(true);
  const gen = useAIGeneration();

  // Keep the field in step with the saved description, but never clobber typing.
  useEffect(() => {
    if (!focused.current) setDescription(initialDescription);
  }, [initialDescription]);

  useEffect(() => {
    if (!gen.generating) return;
    const off = EventsOn("statusline-gen-progress", (line: string) => {
      if (typeof line === "string" && line.trim()) setProgress(line.trim());
    });
    return () => {
      off?.();
    };
  }, [gen.generating]);

  const generate = async () => {
    const desc = description.trim();
    if (!desc) return;
    setProgress("");
    try {
      await gen.run((genId) =>
        GenerateClaudeStatusline(
          ai.selectedCLI,
          ai.selectedModel,
          ai.selectedEffort,
          aiEffectiveFast(ai.selectedCLI, ai.selectedModel, ai.selectedFast),
          selection,
          desc,
          genId,
        ),
      );
      setProgress("");
      onGenerated();
    } catch (err) {
      if (!isCanceledError(err)) toast.error(String(err));
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/40 p-2.5">
      <div className="flex items-center gap-2">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onFocus={() => (focused.current = true)}
          onBlur={() => (focused.current = false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !gen.generating) {
              e.preventDefault();
              void generate();
            }
          }}
          disabled={gen.generating}
          placeholder="Change it with AI — e.g. make the model orange, add a rocket before the folder"
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]"
        />
        {ai.anyAvailable && (
          <AIPickerButton
            onGenerate={() => void generate()}
            onCancel={gen.cancel}
            generating={gen.generating}
            disabled={!description.trim()}
            label="Generate"
            generatingLabel="Generating…"
            title="Change the status line with AI"
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
      </div>
      <div className="mt-1.5 px-0.5 text-[11px] text-[var(--text-muted)]">
        {gen.generating
          ? progress || "Generating…"
          : ai.anyAvailable
            ? "Changes the line above to match your description."
            : "Install Claude Code, Codex, or Gemini to change it with AI."}
      </div>
    </div>
  );
}
