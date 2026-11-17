import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "../notifications/toast";
import { GitBranch } from "lucide-react";
import { Modal } from "./ui/Modal";
import { XIcon } from "./icons";
import { AIPickerButton } from "./ui/AIPickerButton";
import { GenerateBranchName } from "../../bridge/commands";
import { main } from "../../bridge/models";
import { useAIPicker } from "../hooks/useAIPicker";
import { useBranchSearch } from "../hooks/useBranchSearch";
import { isCanceledError, useAIGeneration } from "../hooks/useAIGeneration";
import { aiEffectiveFast } from "../types";
import { newBranchNameSchema } from "../forms/schemas";
import { branchSlug, existingBranch, uncommittedNote, upstreamNote } from "../newBranchHints";
import { branchKey } from "./branchUtils";
import { BranchPicker } from "./BranchPicker";
import { InstructionsChip } from "./InstructionsChip";
import { NewBranchNameHint } from "./NewBranchNameHint";

interface CreateBranchModalProps {
  open: boolean;
  busy: boolean;
  projectName: string;
  projectPath: string;
  status: main.GitStatus;
  branches: main.Branch[];
  // Prefills the name, e.g. with what was typed into the branch search.
  initialName?: string;
  onClose: () => void;
  // `from` is the branch to start at; undefined starts at HEAD.
  onCreate: (name: string, from?: string) => Promise<void> | void;
  onSwitch: (branch: main.Branch) => void;
}

const schema = z.object({ name: newBranchNameSchema });
type FormValues = z.infer<typeof schema>;

export function CreateBranchModal({
  open,
  busy,
  projectName,
  projectPath,
  status,
  branches,
  initialName = "",
  onClose,
  onCreate,
  onSwitch,
}: CreateBranchModalProps) {
  const gen = useAIGeneration(projectName);
  const generating = gen.generating;
  const ai = useAIPicker(open, projectName);
  const openRef = useRef(open);
  const initialNameRef = useRef(initialName);
  initialNameRef.current = initialName;
  // The branch to start from; null is the current checkout.
  const [from, setFrom] = useState<main.Branch | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    setFocus,
    watch,
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
    setFrom(null);
    const initial = branchSlug(initialNameRef.current);
    if (initial) setValue("name", initial, { shouldValidate: true, shouldDirty: true });
    const focusTimer = setTimeout(() => setFocus("name"), 50);
    return () => clearTimeout(focusTimer);
  }, [open, reset, setFocus, setValue]);

  const slug = branchSlug(watch("name") ?? "");
  const searched = useBranchSearch(projectPath, slug, open);
  const existing = existingBranch(slug, [branches, searched]);
  const current = status.branch;
  const isCurrentCheckout = (b: main.Branch) => !b.remote && b.name === current && !status.detached;
  const onCurrent = !!existing && isCurrentCheckout(existing);
  const fromCurrent = from === null;
  const canCreate = !busy && !generating && isValid && !existing;

  const generate = async () => {
    if (generating || !projectPath) return;
    try {
      const result = await gen.run((genId) =>
        GenerateBranchName(
          projectName,
          projectPath,
          ai.selectedCLI,
          ai.selectedModel,
          ai.selectedEffort,
          aiEffectiveFast(ai.selectedCLI, ai.selectedModel, ai.selectedFast),
          genId,
        ),
      );
      if (!openRef.current) return;
      if (result) {
        setValue("name", branchSlug(result), {
          shouldValidate: true,
          shouldDirty: true,
        });
      }
    } catch (err) {
      if (openRef.current && !isCanceledError(err))
        toast.error(`Branch name generation failed: ${err}`);
    }
  };

  const closeModal = () => {
    gen.cancel();
    onClose();
  };

  const onSubmit = handleSubmit(async (values) => {
    const cleaned = branchSlug(values.name);
    if (!cleaned || existing) return;
    await onCreate(cleaned, from ? branchKey(from) : undefined);
  });

  const pickFrom = (b: main.Branch) => setFrom(isCurrentCheckout(b) ? null : b);

  const fromNote = fromCurrent ? upstreamNote(status) : null;
  const carried = fromCurrent ? uncommittedNote(status.uncommitted) : null;

  return (
    <Modal
      open={open}
      onClose={closeModal}
      backdrop={false}
      draggable
      closeOnEscape={!busy}
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
            onClick={closeModal}
            disabled={busy}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <XIcon />
          </button>
        </div>

        <div className="mt-5 flex min-w-0 items-center gap-2">
          <span className="text-xs font-medium text-[var(--text-secondary)]">From</span>
          <BranchPicker
            projectPath={projectPath}
            label={from ? branchKey(from) : current}
            branches={branches}
            isSelected={(b) => (from ? branchKey(b) === branchKey(from) : !b.remote && b.name === current)}
            onSelect={pickFrom}
            disabled={busy || generating}
            menuClassName="w-80"
          />
          {fromNote && (
            <span className="min-w-0 truncate text-[11px] text-[var(--text-muted)]">{fromNote}</span>
          )}
        </div>

        <div className="mt-4">
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
                    onCancel={gen.cancel}
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
          <NewBranchNameHint
            slug={slug}
            existing={existing}
            current={onCurrent}
            onSwitch={() => existing && onSwitch(existing)}
          />
          {carried && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{carried}</p>}
        </div>

        <div className="mt-5 flex items-center justify-between">
          {ai.anyAvailable ? (
            <InstructionsChip projectName={projectName} target="branch" backTitle="New branch" />
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              Cancel
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
