import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "../toast";
import { GitBranch } from "lucide-react";
import { Modal } from "./ui/Modal";
import { XIcon } from "./icons";
import { AIPickerButton } from "./ui/AIPickerButton";
import { GenerateBranchName } from "../../bridge/commands";
import { EventsEmit } from "../../bridge/runtime";
import { useAIPicker } from "../hooks/useAIPicker";
import { aiEffectiveFast } from "../types";
import { newBranchNameSchema } from "../forms/schemas";
import { slugify } from "../slugify";

interface CreateBranchModalProps {
  open: boolean;
  busy: boolean;
  projectName: string;
  projectPath: string;
  onClose: () => void;
  onCreate: (name: string) => Promise<void> | void;
}

const schema = z.object({ name: newBranchNameSchema });
type FormValues = z.infer<typeof schema>;

const normalize = (s: string) => slugify(s, { allowSlash: true });

export function CreateBranchModal({
  open,
  busy,
  projectName,
  projectPath,
  onClose,
  onCreate,
}: CreateBranchModalProps) {
  const [generating, setGenerating] = useState(false);
  const ai = useAIPicker(open);
  const openRef = useRef(open);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    setFocus,
    formState: { isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
    mode: "onChange",
  });

  useEffect(() => {
    openRef.current = open;
    if (!open) return;
    reset({ name: "" });
    setGenerating(false);
    const focusTimer = setTimeout(() => setFocus("name"), 50);
    return () => clearTimeout(focusTimer);
  }, [open, reset, setFocus]);

  const canCreate = !busy && !generating && isValid;

  const generate = async () => {
    if (generating || !projectPath) return;
    setGenerating(true);
    try {
      const result = await GenerateBranchName(
        projectName,
        projectPath,
        ai.selectedCLI,
        ai.selectedModel,
        ai.selectedEffort,
        aiEffectiveFast(ai.selectedCLI, ai.selectedModel, ai.selectedFast),
      );
      if (!openRef.current) return;
      if (result) {
        setValue("name", normalize(result), {
          shouldValidate: true,
          shouldDirty: true,
        });
      }
    } catch (err) {
      if (openRef.current) toast.error(`Branch name generation failed: ${err}`);
    } finally {
      if (openRef.current) setGenerating(false);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    const cleaned = normalize(values.name);
    if (!cleaned) return;
    await onCreate(cleaned);
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      backdrop={false}
      draggable
      closeOnEscape={!busy && !generating}
      zIndexClassName="z-[60]"
      contentClassName="w-[440px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-xl"
    >
      <form onSubmit={onSubmit} noValidate>
        <div
          data-modal-drag-handle
          className="-mx-5 -mt-5 flex items-start gap-3 px-5 pb-1 pt-5"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] ring-1 ring-inset ring-[var(--accent-cyan)]/20">
            <GitBranch size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
              Create and checkout branch
            </h3>
            <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
              Start a new branch and switch to it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy || generating}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <XIcon />
          </button>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
            Branch name
          </label>
          <div
            className={`relative rounded-lg transition-all ${
              generating
                ? "p-[1px] [background:conic-gradient(from_var(--gradient-angle),#6366f1,#a855f7,#ec4899,#06b6d4,#6366f1)] animate-[gradient-spin_3s_linear_infinite]"
                : "border border-[var(--border)] focus-within:border-[var(--text-muted)]"
            }`}
          >
            <div className="flex flex-col rounded-[calc(0.5rem-1px)] bg-[var(--bg-secondary)]">
              <input
                placeholder="new-branch"
                disabled={busy || generating}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className={`w-full bg-transparent px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60 ${
                  ai.anyAvailable ? "pt-2 pb-1" : "py-2"
                }`}
                {...register("name")}
              />
              {ai.anyAvailable && (
                <div className="flex items-center justify-end px-2 pb-1.5">
                  <AIPickerButton
                    onGenerate={generate}
                    generating={generating}
                    disabled={generating || busy || !projectPath}
                    title={`Generate with ${ai.cliLabel}`}
                    label="Generate with AI"
                    aiCLIs={ai.aiCLIs}
                    selectedCLI={ai.selectedCLI}
                    selectedModel={ai.selectedModel}
                    selectedEffort={ai.selectedEffort}
                    selectedFast={ai.selectedFast}
                    onSelect={ai.selectAI}
                    onSelectEffort={ai.selectEffort}
                    onSelectFast={ai.selectFast}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          {ai.anyAvailable ? (
            <button
              type="button"
              onClick={() => {
                EventsEmit("navigate-branch-instructions");
                onClose();
              }}
              className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              Edit AI Instructions
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy || generating}
              className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={!canCreate}
              className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Creating…" : "Create and checkout"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
