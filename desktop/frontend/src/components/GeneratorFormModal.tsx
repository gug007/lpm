import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import {
  type AICLI,
  type Generator,
  type GeneratorDraft,
  type GeneratorIcon,
  type GeneratorType,
} from "../types";
import { Modal } from "./ui/Modal";
import { GeneratorIconButton } from "./GeneratorIconButton";
import { useGeneratorsStore } from "../store/generators";
import { resolveInitialCli } from "../generators";
import { PromptField } from "./PromptField";
import { SegmentedControl } from "./ui/SegmentedControl";
import { AICliSelect } from "./ui/AICliSelect";
import { FIELD_CLASS, HELPER_TEXT, SECTION_LABEL } from "./ui/fields";

const DEFAULT_PROMPT =
  "Create a git repository and initialize the project; set up linting and formatting; add a test or two; make sure everything builds and runs; use conventional commits.";

const TYPE_OPTIONS: { value: GeneratorType; label: string }[] = [
  { value: "ai", label: "Generate with AI" },
  { value: "command", label: "Run command" },
];

interface GeneratorFormModalProps {
  mode: "create" | "edit";
  generator?: Generator;
  onClose: () => void;
}

export function GeneratorFormModal({ mode, generator, onClose }: GeneratorFormModalProps) {
  const addCustom = useGeneratorsStore((s) => s.addCustom);
  const updateGenerator = useGeneratorsStore((s) => s.updateGenerator);

  const [draftId] = useState(() => generator?.id ?? crypto.randomUUID());
  const [label, setLabel] = useState(generator?.label ?? "");
  const [icon, setIcon] = useState<GeneratorIcon>(generator?.icon ?? { type: "emoji", value: "📦" });
  const [type, setType] = useState<GeneratorType>(generator?.type ?? "ai");
  const [prompt, setPrompt] = useState(generator?.prompt ?? DEFAULT_PROMPT);
  const [cli, setCli] = useState<AICLI>(() => resolveInitialCli(generator?.cli));
  const [command, setCommand] = useState(generator?.command ?? "");

  const canSave =
    label.trim().length > 0 &&
    (type === "ai" ? prompt.trim().length > 0 : command.trim().length > 0);

  const save = async () => {
    if (!canSave) return;
    const draft: GeneratorDraft =
      type === "ai"
        ? { label: label.trim(), icon, type: "ai", prompt: prompt.trim(), cli }
        : { label: label.trim(), icon, type: "command", prompt: "", command: command.trim() };
    if (mode === "create") {
      await addCustom(draft);
    } else if (generator) {
      await updateGenerator(generator.id, draft, !!generator.builtin);
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="w-[440px] max-w-[92vw] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex items-start gap-3 px-6 pb-1 pt-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] ring-1 ring-inset ring-[var(--accent-cyan)]/20">
          <Sparkles size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
            {mode === "create" ? "New generator" : "Edit generator"}
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
            Scaffold new projects by running a command or handing a prompt to an AI agent.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 ml-auto shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-4 px-6 pb-2 pt-5">
        <div>
          <label className={`mb-1.5 block ${SECTION_LABEL}`}>Name</label>
          <div className="flex items-center gap-2.5">
            <GeneratorIconButton value={icon} generatorId={draftId} onChange={setIcon} />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              spellCheck={false}
              placeholder="e.g. Expo (React Native)"
              className={`${FIELD_CLASS} h-10 flex-1 px-3`}
            />
          </div>
        </div>

        <div>
          <label className={`mb-1.5 block ${SECTION_LABEL}`}>Type</label>
          <SegmentedControl fullWidth value={type} options={TYPE_OPTIONS} onChange={setType} />
        </div>

        {type === "ai" ? (
          <div key="ai" className="field-reveal space-y-4">
            <div>
              <label className={`mb-1.5 block ${SECTION_LABEL}`}>AI CLI</label>
              <AICliSelect value={cli} onChange={setCli} />
            </div>
            <PromptField label="Initialization prompt" value={prompt} onChange={setPrompt} />
          </div>
        ) : (
          <div key="command" className="field-reveal">
            <label className={`mb-1.5 block ${SECTION_LABEL}`}>Command</label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="npx create-next-app@latest ."
              className={`${FIELD_CLASS} resize-none px-3 py-2 font-mono text-xs`}
            />
            <p className={`mt-1.5 ${HELPER_TEXT}`}>Runs in the new project folder.</p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 px-6 pb-6 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-[13px] font-medium text-[var(--bg-primary)] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {mode === "create" ? "Create" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
