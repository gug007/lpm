import { useRef, useCallback, useState } from "react";
import {
  ReadConfig,
  SaveConfig,
  ReadRepoConfig,
  SaveRepoConfig,
  ReadGlobalConfig,
  SaveGlobalConfig,
  GenerateProjectConfig,
} from "../../bridge/commands";
import { BrowserOpenURL } from "../../bridge/runtime";
import { useYamlEditor } from "../hooks/useYamlEditor";
import { VisualConfigEditor } from "./VisualConfigEditor";
import { MonacoEditor } from "./MonacoEditor";
import {
  PROJECT_MODEL_URI,
  REPO_MODEL_URI,
  GLOBAL_MODEL_URI,
} from "../monaco-setup";
import { ChevronLeftIcon, CodeIcon, HelpCircleIcon } from "./icons";
import { AIButton } from "./ui/AIButton";
import { SegmentedControl } from "./ui/SegmentedControl";
import { AIGenerateModal } from "./AIGenerateModal";
import { type AICLI } from "../types";
import { getSettings, saveSettings } from "../store/settings";

type ConfigTarget = "user" | "repo" | "global";

interface ConfigEditorProps {
  projectName: string;
  onSaved: (newName: string) => void;
  onBack?: () => void;
  onToggleView?: () => void;
  isRemote?: boolean;
}

export function ConfigEditor({
  projectName,
  onSaved,
  onBack,
  onToggleView,
  isRemote = false,
}: ConfigEditorProps) {
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const [target, setTarget] = useState<ConfigTarget>("user");
  const [mode, setMode] = useState<"form" | "yaml">(() => getSettings().configEditorMode ?? "form");

  const changeMode = (next: "form" | "yaml") => {
    if (next === mode) return;
    setMode(next);
    saveSettings({ configEditorMode: next });
  };

  const userLoad = useCallback(() => ReadConfig(projectName), [projectName]);
  const userSave = useCallback(
    async (content: string) => {
      const newName = await SaveConfig(projectName, content);
      onSavedRef.current(newName);
    },
    [projectName],
  );
  const repoLoad = useCallback(() => ReadRepoConfig(projectName), [projectName]);
  const repoSave = useCallback(
    (content: string) => SaveRepoConfig(projectName, content),
    [projectName],
  );
  const globalLoad = useCallback(() => ReadGlobalConfig(), []);
  const globalSave = useCallback(
    (content: string) => SaveGlobalConfig(content),
    [],
  );

  const userEditor = useYamlEditor(userLoad, userSave);
  const repoEditor = useYamlEditor(repoLoad, repoSave);
  const globalEditor = useYamlEditor(globalLoad, globalSave);
  const active =
    target === "user" ? userEditor : target === "repo" ? repoEditor : globalEditor;
  const modelUri =
    target === "user"
      ? PROJECT_MODEL_URI
      : target === "repo"
        ? REPO_MODEL_URI
        : GLOBAL_MODEL_URI;

  // Form view binds to project identity, which only exists in user config \u2014
  // force YAML for repo and global targets.
  const effectiveMode = target === "user" ? mode : "yaml";

  const [aiOpen, setAiOpen] = useState(false);

  const handleAIGenerate = async (cli: AICLI, extraPrompt: string) => {
    const yaml = await GenerateProjectConfig(projectName, cli, extraPrompt);
    userEditor.setContent(yaml);
    changeMode("yaml");
    setTarget("user");
    setAiOpen(false);
  };

  return (
    <div className="flex h-full flex-col">
      {onBack && (
        <div className="flex items-center justify-between gap-3 px-6 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              title="Back to terminal"
            >
              <ChevronLeftIcon />
            </button>
            <span className="text-sm font-medium text-[var(--text-primary)]">Config</span>
            <button
              onClick={() => BrowserOpenURL("https://lpm.cx/config")}
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              title="Open configuration reference"
            >
              <HelpCircleIcon />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl
              value={target}
              onChange={setTarget}
              options={
                isRemote
                  ? [
                      {
                        value: "user",
                        label: "User",
                        tooltip: "Your personal settings for this project. Only you see them.",
                      },
                      {
                        value: "global",
                        label: "Global",
                        tooltip:
                          "Defaults shared across all your projects. Used when a project doesn't override them.",
                      },
                    ]
                  : [
                      {
                        value: "user",
                        label: "User",
                        tooltip: "Your personal settings for this project. Only you see them.",
                      },
                      {
                        value: "repo",
                        label: "Repo",
                        tooltip:
                          "Settings saved inside the project folder. Anyone who opens this project gets the same actions, services, and profiles.",
                      },
                      {
                        value: "global",
                        label: "Global",
                        tooltip:
                          "Defaults shared across all your projects. Used when a project doesn't override them.",
                      },
                    ]
              }
            />
            <div
              className={`flex items-center gap-2 ${
                target === "user" ? "" : "invisible pointer-events-none"
              }`}
              aria-hidden={target !== "user"}
            >
              <span aria-hidden className="mx-1 h-4 w-px bg-[var(--border)]" />
              <button
                onClick={() => changeMode(mode === "form" ? "yaml" : "form")}
                className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                  mode === "yaml"
                    ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                }`}
                title={mode === "form" ? "Switch to source view" : "Switch to form view"}
              >
                <CodeIcon />
              </button>
              <AIButton onClick={() => setAiOpen(true)} title="Generate config with AI">
                Generate with AI
              </AIButton>
            </div>
          </div>
        </div>
      )}

      {effectiveMode === "form" ? (
        <VisualConfigEditor content={active.content} onChange={active.setContent} />
      ) : (
        <div className="relative flex-1 overflow-hidden">
          <MonacoEditor
            value={active.content}
            onChange={active.setContent}
            language="yaml"
            modelUri={modelUri}
            onSave={active.handleSave}
            onToggleView={onToggleView}
          />
        </div>
      )}

      {(active.dirty || active.error) && (
        <div className="absolute bottom-4 right-4 z-10 flex items-end gap-2">
          {active.error && (
            <pre className="max-w-[420px] whitespace-pre-wrap rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/10 px-3 py-2 text-left text-[11px] leading-relaxed text-[var(--accent-red)] shadow-lg">
              {active.error}
            </pre>
          )}
          <span className="mb-2 text-[10px] text-[var(--text-muted)]">{"\u2318"}S</span>
          <button
            onClick={active.handleSave}
            disabled={!active.dirty || active.saving}
            className="rounded-lg bg-[var(--text-primary)] px-3.5 py-1.5 text-xs font-medium text-[var(--bg-primary)] shadow-lg transition-all hover:opacity-85 disabled:opacity-40"
          >
            {active.saving ? "Saving..." : "Save"}
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
