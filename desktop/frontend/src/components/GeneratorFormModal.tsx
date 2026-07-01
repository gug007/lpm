import { useState } from "react";
import type { Generator, GeneratorIcon } from "../types";
import { Modal } from "./ui/Modal";
import { GeneratorIconPicker } from "./GeneratorIconPicker";
import { useGeneratorsStore } from "../store/generators";
import { PromptField } from "./PromptField";

const DEFAULT_PROMPT =
  "Create a git repository and initialize the project; set up linting and formatting; add a test or two; make sure everything builds and runs; use conventional commits.";

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
  const [prompt, setPrompt] = useState(generator?.prompt ?? DEFAULT_PROMPT);

  const canSave = label.trim().length > 0 && prompt.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    if (mode === "create") {
      await addCustom({ label: label.trim(), icon, prompt: prompt.trim() });
    } else if (generator) {
      await updateGenerator(generator.id, { label: label.trim(), icon, prompt: prompt.trim() }, !!generator.builtin);
    }
    onClose();
  };

  return (
    <Modal open onClose={onClose} contentClassName="w-[460px] max-w-[92vw] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 text-[var(--text-primary)] shadow-2xl" zIndexClassName="z-[60]">
      <h2 className="text-base font-semibold mb-4">{mode === "create" ? "New generator" : "Edit generator"}</h2>

      <label className="block text-xs opacity-70 mb-1">Name</label>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
        placeholder="e.g. Expo (React Native)"
      />

      <label className="block text-xs opacity-70 mb-1">Icon</label>
      <div className="mb-3">
        <GeneratorIconPicker value={icon} generatorId={draftId} onChange={setIcon} />
      </div>

      <div className="mb-4">
        <PromptField label="Initialization prompt" value={prompt} onChange={setPrompt} />
      </div>

      <div className="flex justify-end gap-2">
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
