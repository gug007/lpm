import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Modal } from "./ui/Modal";
import { XIcon } from "./icons";
import { AIPickerButton } from "./ui/AIPickerButton";
import {
  CheckAICLIs,
  GenerateBranchName,
} from "../../wailsjs/go/main/App";
import { EventsEmit } from "../../wailsjs/runtime/runtime";
import { AI_CLI_OPTIONS, aiDefaultModel, aiPickLabel, resolveAIPick, type AICLI } from "../types";
import { getSettings, saveSettings } from "../store/settings";
import { newBranchNameSchema } from "../forms/schemas";
import { slugify } from "../slugify";

interface CreateBranchModalProps {
  open: boolean;
  busy: boolean;
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
  projectPath,
  onClose,
  onCreate,
}: CreateBranchModalProps) {
  const [generating, setGenerating] = useState(false);
  const [aiCLIs, setAiCLIs] = useState<Record<string, boolean>>({});
  const [selectedCLI, setSelectedCLI] = useState<AICLI>(
    () => (getSettings().aiCli as AICLI) || "claude",
  );
  const [selectedModel, setSelectedModel] = useState<string>(
    () => getSettings().aiModel ?? aiDefaultModel("claude"),
  );
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
    let cancelled = false;
    reset({ name: "" });
    setGenerating(false);
    const focusTimer = setTimeout(() => setFocus("name"), 50);
    CheckAICLIs()
      .then((a) => {
        if (cancelled) return;
        const avail: Record<string, boolean> = {
          claude: a.claude,
          codex: a.codex,
          gemini: a.gemini,
          opencode: a.opencode,
        };
        setAiCLIs(avail);
        const s = getSettings();
        const pick = resolveAIPick(s.aiCli, s.aiModel, avail);
        if (pick) {
          setSelectedCLI(pick.cli);
          setSelectedModel(pick.model);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(focusTimer);
    };
  }, [open, reset, setFocus]);

  const anyAiAvailable = AI_CLI_OPTIONS.some((o) => aiCLIs[o.value]);

  const canCreate = !busy && !generating && isValid;

  const generate = async () => {
    if (generating || !projectPath) return;
    setGenerating(true);
    try {
      const result = await GenerateBranchName(projectPath, selectedCLI, selectedModel);
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

  const selectedCLILabel = aiPickLabel(selectedCLI, selectedModel);

  const selectAI = (cli: AICLI, model: string) => {
    setSelectedCLI(cli);
    setSelectedModel(model);
    saveSettings({ aiCli: cli, aiModel: model });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={!busy && !generating}
      closeOnEscape={!busy && !generating}
      zIndexClassName="z-[60]"
      contentClassName="w-[440px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-xl"
    >
      <form onSubmit={onSubmit} noValidate>
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Create and checkout branch
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy || generating}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
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
                  anyAiAvailable ? "pt-2 pb-1" : "py-2"
                }`}
                {...register("name")}
              />
              {anyAiAvailable && (
                <div className="flex items-center justify-end px-2 pb-1.5">
                  <AIPickerButton
                    onGenerate={generate}
                    generating={generating}
                    disabled={generating || busy || !projectPath}
                    title={`Generate with ${selectedCLILabel}`}
                    label="Generate with AI"
                    aiCLIs={aiCLIs}
                    selectedCLI={selectedCLI}
                    selectedModel={selectedModel}
                    onSelect={selectAI}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          {anyAiAvailable ? (
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
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
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
