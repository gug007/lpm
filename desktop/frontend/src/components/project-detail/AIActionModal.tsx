import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "../ui/Modal";
import { AIPickerButton } from "../ui/AIPickerButton";
import { XIcon, SparkleIcon } from "../icons";
import { GenerateActionYAML } from "../../../wailsjs/go/main/App";
import { EventsOn } from "../../../wailsjs/runtime/runtime";
import { useAIPicker } from "../../hooks/useAIPicker";
import { aiEffectiveFast } from "../../types";

const ACTION_YAML_PROGRESS_EVENT = "action-yaml-progress";

interface AIActionModalProps {
  open: boolean;
  projectName: string;
  isEditing: boolean;
  currentYAML: string;
  onClose: () => void;
  onGenerated: (yaml: string) => void;
}

export function AIActionModal({
  open,
  projectName,
  isEditing,
  currentYAML,
  onClose,
  onGenerated,
}: AIActionModalProps) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const ai = useAIPicker(open);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setPrompt("");
    setProgress("");
    setGenerating(false);
    setTimeout(() => textareaRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const unsubscribe = EventsOn(ACTION_YAML_PROGRESS_EVENT, (msg: string) => {
      setProgress((prev) => prev + msg);
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [open]);

  const submit = async () => {
    const value = prompt.trim();
    if (!value || generating) return;
    setGenerating(true);
    setProgress("");
    try {
      const raw = await GenerateActionYAML(
        projectName,
        ai.selectedCLI,
        ai.selectedModel,
        ai.selectedEffort,
        aiEffectiveFast(ai.selectedCLI, ai.selectedModel, ai.selectedFast),
        value,
        currentYAML,
      );
      const cleaned = stripCodeFences(typeof raw === "string" ? raw : "");
      if (!cleaned.trim()) {
        toast.error("AI returned an empty response");
        return;
      }
      onGenerated(cleaned);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const title = isEditing ? "Edit action with AI" : "Generate action with AI";
  const subtitle = isEditing
    ? "Describe what to change about this action."
    : "Describe what the action should do, and AI will fill it in.";

  return (
    <Modal
      open={open}
      onClose={generating ? () => {} : onClose}
      backdropClassName="bg-black/60 backdrop-blur-sm"
      closeOnBackdrop={!generating}
      closeOnEscape={!generating}
      contentClassName="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
      zIndexClassName="z-[60]"
    >
      <div className="flex w-[min(640px,calc(100vw-32px))] flex-col">
        <header className="flex items-start justify-between gap-4 px-7 pb-4 pt-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <span className="text-[var(--text-secondary)]">
                <SparkleIcon />
              </span>
              <h2 className="text-[18px] font-semibold leading-tight tracking-tight">{title}</h2>
            </div>
            <p className="mt-1.5 text-[12.5px] leading-5 text-[var(--text-muted)]">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            aria-label="Close"
            className="-mr-2 -mt-1 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <XIcon />
          </button>
        </header>

        <div className="px-7 pb-2">
          <div
            className={`relative rounded-xl transition-all ${
              generating
                ? "p-[1px] [background:conic-gradient(from_var(--gradient-angle),#6366f1,#a855f7,#ec4899,#06b6d4,#6366f1)] animate-[gradient-spin_3s_linear_infinite]"
                : "border border-[var(--border)] focus-within:border-[var(--text-muted)]"
            }`}
          >
            <div className="rounded-[calc(0.75rem-1px)] bg-[var(--bg-secondary)]">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                placeholder={
                  isEditing
                    ? "e.g. add a confirm step, change the working directory to ./api…"
                    : "e.g. tail server logs in a reusable terminal pane"
                }
                rows={5}
                disabled={generating}
                className="w-full resize-none rounded-[calc(0.75rem-1px)] bg-transparent px-4 py-3 text-[13.5px] leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
              />
            </div>
          </div>

          {generating && progress.trim() && (
            <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--text-muted)]">
              {progress}
            </pre>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 px-7 pb-6 pt-3">
          <span className="text-[11px] text-[var(--text-muted)]">
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-1 py-px font-mono text-[10px]">⌘↵</kbd>{" "}
            to run
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={generating}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              Cancel
            </button>
            {ai.anyAvailable ? (
              <AIPickerButton
                onGenerate={submit}
                generating={generating}
                disabled={generating || !prompt.trim()}
                title={`Generate with ${ai.cliLabel}`}
                label={isEditing ? "Apply with AI" : "Generate"}
                generatingLabel={isEditing ? "Applying…" : "Generating…"}
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
            ) : (
              <span className="text-[11px] text-[var(--text-muted)]">No AI CLI detected</span>
            )}
          </div>
        </footer>
      </div>
    </Modal>
  );
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:yaml|yml)?\s*\n?([\s\S]*?)\n?```$/i;
  const m = trimmed.match(fence);
  return (m ? m[1] : trimmed).trim();
}
