import { useRef, useCallback, useState } from "react";
import { ReadConfig, SaveConfig, GenerateProjectConfig } from "../../wailsjs/go/main/App";
import { useYamlEditor } from "../hooks/useYamlEditor";
import { VisualConfigEditor } from "./VisualConfigEditor";
import { MonacoYamlEditor } from "./MonacoYamlEditor";
import { PROJECT_MODEL_URI } from "../monaco-setup";
import { ChevronLeftIcon } from "./icons";
import { AIButton } from "./ui/AIButton";
import { AIGenerateModal } from "./AIGenerateModal";
import { type AICLI } from "../types";
import { getSettings, saveSettings } from "../settings";

interface ConfigEditorProps {
  projectName: string;
  onSaved: (newName: string) => void;
  onBack?: () => void;
}

export function ConfigEditor({ projectName, onSaved, onBack }: ConfigEditorProps) {
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const [mode, setMode] = useState<"form" | "yaml">(() => getSettings().configEditorMode ?? "form");

  const changeMode = (next: "form" | "yaml") => {
    if (next === mode) return;
    setMode(next);
    saveSettings({ configEditorMode: next });
  };

  const load = useCallback(() => ReadConfig(projectName), [projectName]);
  const save = useCallback(
    async (content: string) => {
      const newName = await SaveConfig(projectName, content);
      onSavedRef.current(newName);
    },
    [projectName],
  );

  const { content, setContent, dirty, saving, error, handleSave } =
    useYamlEditor(load, save);

  const [aiOpen, setAiOpen] = useState(false);

  const handleAIGenerate = async (cli: AICLI, extraPrompt: string) => {
    const yaml = await GenerateProjectConfig(projectName, cli, extraPrompt);
    setContent(yaml);
    changeMode("yaml");
    setAiOpen(false);
  };

  return (
    <div className="flex h-full flex-col">
      {onBack && (
        <div className="flex items-center justify-between gap-3 px-6 pt-3 pb-2">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              title="Back to terminal"
            >
              <ChevronLeftIcon />
            </button>
            <span className="text-sm font-medium text-[var(--text-primary)]">Config</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-[var(--border)] p-0.5">
              <button
                onClick={() => changeMode("form")}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  mode === "form"
                    ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Form
              </button>
              <button
                onClick={() => changeMode("yaml")}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  mode === "yaml"
                    ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Source
              </button>
            </div>
            <AIButton onClick={() => setAiOpen(true)} title="Generate config with AI">
              Generate with AI
            </AIButton>
          </div>
        </div>
      )}

      {mode === "form" ? (
        <VisualConfigEditor content={content} onChange={setContent} />
      ) : (
        <div className="relative flex-1 overflow-hidden">
          <MonacoYamlEditor
            value={content}
            onChange={setContent}
            modelUri={PROJECT_MODEL_URI}
            onSave={handleSave}
          />
        </div>
      )}

      {(dirty || error) && (
        <div className="absolute bottom-4 right-4 z-10 flex items-end gap-2">
          {error && (
            <pre className="max-w-[420px] whitespace-pre-wrap rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/10 px-3 py-2 text-left text-[11px] leading-relaxed text-[var(--accent-red)] shadow-lg">
              {error}
            </pre>
          )}
          <span className="mb-2 text-[10px] text-[var(--text-muted)]">{"\u2318"}S</span>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="rounded-lg bg-[var(--text-primary)] px-3.5 py-1.5 text-xs font-medium text-[var(--bg-primary)] shadow-lg transition-all hover:opacity-85 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}

      <AIGenerateModal
        open={aiOpen}
        onCancel={() => setAiOpen(false)}
        onGenerate={handleAIGenerate}
      />
    </div>
  );
}
