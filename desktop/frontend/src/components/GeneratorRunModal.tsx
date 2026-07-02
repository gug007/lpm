import { useState } from "react";
import { X } from "lucide-react";
import { isAICLI, type AICLI, type Generator, type GeneratorRunSpec } from "../types";
import { Modal } from "./ui/Modal";
import { BrowseFolder } from "../../bridge/commands";
import { useAppStore } from "../store/app";
import { getSettings } from "../store/settings";
import { PromptField } from "./PromptField";
import { AICliSelect } from "./ui/AICliSelect";
import { GeneratorIconView } from "./generatorIcons";
import { FIELD_CLASS, HELPER_TEXT, SECTION_LABEL } from "./ui/fields";

interface GeneratorRunModalProps {
  generator: Generator;
  onClose: () => void;
}

export function GeneratorRunModal({ generator, onClose }: GeneratorRunModalProps) {
  const runGenerator = useAppStore((s) => s.runGenerator);
  const [destParent, setDestParent] = useState(getSettings().defaultProjectDirectory || "");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState(generator.prompt);
  const [command, setCommand] = useState(generator.command ?? "");
  const [cli, setCli] = useState<AICLI>(() => {
    if (generator.cli) return generator.cli;
    const saved = getSettings().aiCli;
    return isAICLI(saved) ? saved : "claude";
  });

  const isCommand = generator.type === "command";

  const chooseFolder = async () => {
    const dir = await BrowseFolder(destParent || getSettings().defaultProjectDirectory);
    if (!dir) return;
    setDestParent(dir);
  };

  const canRun =
    destParent.trim().length > 0 &&
    name.trim().length > 0 &&
    (!isCommand || command.trim().length > 0);

  const run = async () => {
    if (!canRun) return;
    const root = `${destParent.replace(/\/+$/, "")}/${name.trim()}`;
    const spec: GeneratorRunSpec = isCommand
      ? { type: "command", command: command.trim() }
      : { type: "ai", cli, prompt: prompt.trim() };
    await runGenerator({ folder: root, name: name.trim(), spec });
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
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
          <GeneratorIconView icon={generator.icon} size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
            Run “{generator.label}”
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
            Create a new project scaffolded by this generator.
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
          <label className={`mb-1.5 block ${SECTION_LABEL}`}>Destination folder</label>
          <div className="flex items-center gap-2">
            <div
              className={`${FIELD_CLASS} flex h-9 flex-1 items-center truncate px-3 ${
                destParent ? "" : "text-[var(--text-muted)]"
              }`}
            >
              {destParent || "No folder chosen"}
            </div>
            <button
              type="button"
              onClick={chooseFolder}
              className="h-9 shrink-0 rounded-lg border border-[var(--border)] px-3 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              Choose…
            </button>
          </div>
          <p className={`mt-1.5 ${HELPER_TEXT}`}>Project will be created in a new subfolder here.</p>
        </div>

        <div>
          <label className={`mb-1.5 block ${SECTION_LABEL}`}>Project name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            spellCheck={false}
            placeholder="my-app"
            className={`${FIELD_CLASS} h-9 w-full px-3`}
          />
        </div>

        {isCommand ? (
          <div>
            <label className={`mb-1.5 block ${SECTION_LABEL}`}>Command</label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              rows={3}
              spellCheck={false}
              className={`${FIELD_CLASS} resize-none px-3 py-2 font-mono text-xs`}
            />
            <p className={`mt-1.5 ${HELPER_TEXT}`}>
              Tweaks here apply to this run only — your saved generator stays unchanged.
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className={`mb-1.5 block ${SECTION_LABEL}`}>AI CLI</label>
              <AICliSelect value={cli} onChange={setCli} />
            </div>
            <PromptField
              label="Prompt"
              value={prompt}
              onChange={setPrompt}
              defaultCollapsed
              hint="Tweaks here apply to this run only — your saved generator stays unchanged."
            />
          </>
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
          onClick={run}
          disabled={!canRun}
          className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-[13px] font-medium text-[var(--bg-primary)] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isCommand ? "Create & Run command" : "Create & Run agent"}
        </button>
      </div>
    </Modal>
  );
}
