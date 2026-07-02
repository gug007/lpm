import { useState } from "react";
import {
  isAICLI,
  type AICLI,
  type Generator,
  type GeneratorDraft,
  type GeneratorIcon,
  type GeneratorType,
} from "../types";
import { Modal } from "./ui/Modal";
import { GeneratorIconPicker } from "./GeneratorIconPicker";
import { useGeneratorsStore } from "../store/generators";
import { getSettings } from "../store/settings";
import { PromptField } from "./PromptField";
import { SegmentedControl } from "./ui/SegmentedControl";
import { AICliSelect } from "./ui/AICliSelect";

const DEFAULT_PROMPT =
  "Create a git repository and initialize the project; set up linting and formatting; add a test or two; make sure everything builds and runs; use conventional commits.";

const TYPE_OPTIONS: { value: GeneratorType; label: string }[] = [
  { value: "ai", label: "Generate with AI" },
  { value: "command", label: "Run command" },
];

const LABEL_CLASS = "mb-1.5 block text-xs font-medium text-[var(--text-muted)]";
const INPUT_CLASS =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:outline-none";

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
  const [cli, setCli] = useState<AICLI>(() => {
    if (generator?.cli) return generator.cli;
    const saved = getSettings().aiCli;
    return isAICLI(saved) ? saved : "claude";
  });
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
    <Modal open onClose={onClose} contentClassName="w-[440px] max-w-[92vw] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 text-[var(--text-primary)] shadow-2xl" zIndexClassName="z-[60]">
      <h2 className="mb-5 text-base font-semibold">{mode === "create" ? "New generator" : "Edit generator"}</h2>

      <div className="space-y-4">
        <div>
          <label className={LABEL_CLASS}>Name</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={INPUT_CLASS}
            placeholder="e.g. Expo (React Native)"
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Icon</label>
          <GeneratorIconPicker value={icon} generatorId={draftId} onChange={setIcon} />
        </div>

        <div>
          <label className={LABEL_CLASS}>Type</label>
          <SegmentedControl fullWidth value={type} options={TYPE_OPTIONS} onChange={setType} />
        </div>

        {type === "ai" ? (
          <>
            <div>
              <label className={LABEL_CLASS}>AI CLI</label>
              <AICliSelect value={cli} onChange={setCli} />
            </div>
            <PromptField label="Initialization prompt" value={prompt} onChange={setPrompt} />
          </>
        ) : (
          <div>
            <label className={LABEL_CLASS}>Command</label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="npx create-next-app@latest ."
              className={`${INPUT_CLASS} resize-none font-mono text-xs`}
            />
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">Runs in the new project folder.</p>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="rounded-lg bg-[var(--accent-blue)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          {mode === "create" ? "Create" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
