import { useState } from "react";
import type { Generator } from "../types";
import { Modal } from "./ui/Modal";
import { BrowseFolder } from "../../bridge/commands";
import { useAppStore } from "../store/app";
import { getSettings } from "../store/settings";
import { PromptField } from "./PromptField";

interface GeneratorRunModalProps {
  generator: Generator;
  onClose: () => void;
}

export function GeneratorRunModal({ generator, onClose }: GeneratorRunModalProps) {
  const runGenerator = useAppStore((s) => s.runGenerator);
  const [destParent, setDestParent] = useState(getSettings().defaultProjectDirectory || "");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState(generator.prompt);

  const chooseFolder = async () => {
    const dir = await BrowseFolder(destParent || getSettings().defaultProjectDirectory);
    if (!dir) return;
    setDestParent(dir);
  };

  const canRun = destParent.trim().length > 0 && name.trim().length > 0;

  const run = async () => {
    if (!canRun) return;
    const root = `${destParent.replace(/\/+$/, "")}/${name.trim()}`;
    await runGenerator({ folder: root, name: name.trim(), prompt: prompt.trim() });
    onClose();
  };

  return (
    <Modal open onClose={onClose} contentClassName="w-[460px] max-w-[92vw] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 text-[var(--text-primary)] shadow-2xl" zIndexClassName="z-[60]">
      <h2 className="text-base font-semibold mb-4">Run "{generator.label}" generator</h2>

      <label className="block text-xs opacity-70 mb-1">Destination folder</label>
      <div className="mb-1 flex items-center gap-2">
        <div className="flex-1 truncate rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm">
          {destParent || "No folder chosen"}
        </div>
        <button type="button" onClick={chooseFolder} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
          Choose…
        </button>
      </div>
      <p className="mb-3 text-[11px] text-[var(--text-muted)]">Project will be created in a new subfolder here.</p>

      <label className="block text-xs opacity-70 mb-1">Project name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="my-app"
        className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
      />

      <div className="mb-4">
        <PromptField
          label="Prompt"
          value={prompt}
          onChange={setPrompt}
          defaultCollapsed
          hint="Tweaks here apply to this run only — your saved generator stays unchanged."
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">
          Cancel
        </button>
        <button
          type="button"
          onClick={run}
          disabled={!canRun}
          className="rounded-lg bg-[var(--accent-blue)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          Create &amp; Run agent
        </button>
      </div>
    </Modal>
  );
}
