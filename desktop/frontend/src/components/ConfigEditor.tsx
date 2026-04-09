import { useRef, useEffect, useCallback, useState } from "react";
import { ReadConfig, SaveConfig, GenerateProjectConfig } from "../../wailsjs/go/main/App";
import { useYamlEditor } from "../hooks/useYamlEditor";
import { VisualConfigEditor } from "./VisualConfigEditor";
import { ChevronLeftIcon } from "./icons";
import { AIButton } from "./ui/AIButton";
import { AIGenerateModal } from "./AIGenerateModal";
import { type AICLI } from "../types";

interface ConfigEditorProps {
  projectName: string;
  onSaved: (newName: string) => void;
  onBack?: () => void;
}

export function ConfigEditor({ projectName, onSaved, onBack }: ConfigEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const [mode, setMode] = useState<"visual" | "yaml">("yaml");

  const load = useCallback(() => ReadConfig(projectName), [projectName]);
  const save = useCallback(
    async (content: string) => {
      const newName = await SaveConfig(projectName, content);
      onSavedRef.current(newName);
    },
    [projectName],
  );

  const { content, setContent, dirty, saving, error, handleSave, handleTab } =
    useYamlEditor(load, save);

  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    if (mode === "yaml") textareaRef.current?.focus();
  }, [projectName, mode]);

  const handleAIGenerate = async (cli: AICLI, extraPrompt: string) => {
    const yaml = await GenerateProjectConfig(projectName, cli, extraPrompt);
    setContent(yaml);
    setMode("yaml");
    setAiOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
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
                onClick={() => setMode("visual")}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  mode === "visual"
                    ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Visual
              </button>
              <button
                onClick={() => setMode("yaml")}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  mode === "yaml"
                    ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                YAML
              </button>
            </div>
            {mode === "yaml" && (
              <AIButton onClick={() => setAiOpen(true)} title="Generate config with AI">
                Generate with AI
              </AIButton>
            )}
          </div>
        </div>
      )}

      {mode === "visual" ? (
        <VisualConfigEditor
          projectName={projectName}
          onSaved={onSaved}
        />
      ) : (
        <div className="relative flex-1 overflow-hidden">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleTab}
            spellCheck={false}
            className="h-full w-full resize-none bg-[var(--bg-primary)] px-6 py-4 font-mono text-sm leading-relaxed text-[var(--text-primary)] outline-none"
            style={{ tabSize: 2 }}
          />
          {(dirty || error) && (
            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              {error && (
                <span className="text-xs text-[var(--accent-red)]">{error}</span>
              )}
              <span className="text-[10px] text-[var(--text-muted)]">{"\u2318"}S</span>
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="rounded-lg bg-[var(--text-primary)] px-3.5 py-1.5 text-xs font-medium text-[var(--bg-primary)] shadow-lg transition-all hover:opacity-85 disabled:opacity-40"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          )}
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
