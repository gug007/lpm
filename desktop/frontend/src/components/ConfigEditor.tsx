import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "../notifications/toast";
import {
  ReadConfig,
  SaveConfig,
  ReadRepoConfig,
  GenerateProjectConfig,
} from "../../bridge/commands";
import { BrowserOpenURL } from "../../bridge/runtime";
import { useYamlEditor } from "../hooks/useYamlEditor";
import { projectGlobalLayer, projectLayer, queueWrite, repoLayer, saveLayer } from "../yamlQueue";
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
import { validateYaml } from "../yamlValidation";
import { primaryHint } from "../shortcutHints";
import { configProblems, type ConfigProblem } from "../configProblems";
import { useConfigFix } from "../hooks/useConfigFix";
import { ConfigProblemNotice } from "./ConfigProblemNotice";

type ConfigTarget = "user" | "repo" | "global";

const USER_TARGET = {
  value: "user" as const,
  label: "User",
  tooltip: "Your personal settings for this project. Only you see them.",
};
const REPO_TARGET = {
  value: "repo" as const,
  label: "Repo",
  tooltip:
    "Settings saved inside the project folder. Anyone who opens this project gets the same actions, services, and profiles.",
};
const GLOBAL_TARGET = {
  value: "global" as const,
  label: "Global",
  tooltip: "Defaults shared across all your projects. Used when a project doesn't override them.",
};

interface ConfigEditorProps {
  projectName: string;
  onSaved: (newName: string) => void;
  onBack?: () => void;
  onToggleView?: () => void;
  isRemote?: boolean;
  // Why the project's own file doesn't load, as the project page reported it.
  loadError?: string;
  // Opened from that error: at the line it names, or asking AI for a fix.
  startWith?: "line" | "fix";
}

export function ConfigEditor({
  projectName,
  onSaved,
  onBack,
  onToggleView,
  isRemote = false,
  loadError,
  startWith,
}: ConfigEditorProps) {
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  // Each layer is the machine's the project is on, a paired one's too. An SSH
  // project has no repo file here to edit.
  const targets = isRemote ? [USER_TARGET, GLOBAL_TARGET] : [USER_TARGET, REPO_TARGET, GLOBAL_TARGET];

  const [target, setTarget] = useState<ConfigTarget>("user");
  const [mode, setMode] = useState<"form" | "yaml">(() =>
    startWith ? "yaml" : (getSettings().configEditorMode ?? "form"),
  );
  // Where the YAML editor opens, or moves to once open.
  const [goTo, setGoTo] = useState<{ line: number; col: number } | undefined>(() =>
    startWith ? configProblems(loadError)[0] : undefined,
  );
  const changeTarget = (next: ConfigTarget) => {
    setTarget(next);
    setGoTo(undefined);
  };

  const changeMode = (next: "form" | "yaml") => {
    if (next === mode) return;
    if (next === "form") setGoTo(undefined);
    setMode(next);
    saveSettings({ configEditorMode: next });
  };

  const userLoad = useCallback(() => ReadConfig(projectName), [projectName]);
  const userSave = useCallback(
    async (content: string) => {
      const newName = await queueWrite(projectLayer(projectName).queueKey, () => SaveConfig(projectName, content));
      onSavedRef.current(newName);
    },
    [projectName],
  );
  const repoLoad = useCallback(() => ReadRepoConfig(projectName), [projectName]);
  const repoSave = useCallback(
    (content: string) => saveLayer(repoLayer(projectName), content),
    [projectName],
  );
  const globalLoad = useCallback(() => projectGlobalLayer(projectName).read(), [projectName]);
  const globalSave = useCallback(
    (content: string) => saveLayer(projectGlobalLayer(projectName), content),
    [projectName],
  );

  const userEditor = useYamlEditor(userLoad, userSave, validateYaml, `config:${projectName}`);
  const repoEditor = useYamlEditor(repoLoad, repoSave, validateYaml, `repo-config:${projectName}`);
  const globalEditor = useYamlEditor(
    globalLoad,
    globalSave,
    validateYaml,
    projectGlobalLayer(projectName).queueKey,
  );
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
  const activeError = active.validationError ?? active.error;
  // The project page's error is about the saved user file, so it holds until
  // that file is edited.
  const shownError =
    activeError ?? (target === "user" && active.loaded && !active.dirty ? loadError ?? null : null);
  const problems = useMemo(() => configProblems(shownError), [shownError]);
  const firstProblem = problems.at(0);

  const goToProblem = (problem: ConfigProblem) => {
    setGoTo({ line: problem.line, col: problem.col });
    if (effectiveMode === "form") changeMode("yaml");
  };

  const fixer = useConfigFix();
  const fixWithAI = async (editor: typeof active, error: string) => {
    const fixed = await fixer.fix(editor.content, error);
    if (fixed === null) return;
    if (fixed.trim() === editor.content.trim()) toast("AI found nothing to change");
    else editor.setContent(fixed);
  };
  const autoFixed = useRef(false);
  useEffect(() => {
    if (startWith !== "fix" || autoFixed.current || !userEditor.loaded || !loadError) return;
    autoFixed.current = true;
    void fixWithAI(userEditor, loadError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWith, userEditor.loaded, loadError]);

  const [aiOpen, setAiOpen] = useState(false);

  const handleAIGenerate = (cli: AICLI, extraPrompt: string, genId: string): Promise<string> =>
    GenerateProjectConfig(projectName, cli, extraPrompt, genId);

  // Reviewed first, the generated config replaces the user file in the editor:
  // unsaved, or saved at once.
  const applyGenerated = (yaml: string, save: boolean) => {
    if (save) void userEditor.saveContent(yaml);
    else userEditor.setContent(yaml);
    changeMode("yaml");
    changeTarget("user");
    setAiOpen(false);
  };

  return (
    <div className="flex h-full flex-col" onKeyDown={active.handleSaveKey}>
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
            {targets.length > 1 && (
              <SegmentedControl value={target} onChange={changeTarget} options={targets} />
            )}
            <div
              className={`flex items-center gap-2 ${
                target === "user" ? "" : "invisible pointer-events-none"
              }`}
              aria-hidden={target !== "user"}
            >
              {targets.length > 1 && <span aria-hidden className="mx-1 h-4 w-px bg-[var(--border)]" />}
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
        <VisualConfigEditor
          content={active.content}
          onChange={active.setContent}
          onEditYaml={() => (firstProblem ? goToProblem(firstProblem) : changeMode("yaml"))}
          isRemote={isRemote}
        />
      ) : (
        <div className="relative flex-1 overflow-hidden">
          {(active.loaded || active.error) && (
            <MonacoEditor
              key={modelUri}
              value={active.content}
              onChange={active.setContent}
              language="yaml"
              modelUri={modelUri}
              onSave={active.handleSave}
              onToggleView={onToggleView}
              readOnly={fixer.fixing}
              reveal={goTo}
              jumpTo={goTo}
              problems={problems}
            />
          )}
        </div>
      )}

      {(active.dirty || shownError) && (
        <div className="absolute bottom-4 right-4 z-10 flex items-end gap-2">
          {shownError && (
            <ConfigProblemNotice
              message={shownError}
              goTo={firstProblem && { line: firstProblem.line, onClick: () => goToProblem(firstProblem) }}
              fix={
                fixer.available
                  ? { fixing: fixer.fixing, onFix: () => void fixWithAI(active, shownError), onCancel: fixer.cancel }
                  : undefined
              }
            />
          )}
          <span className="mb-2 text-[10px] text-[var(--text-muted)]">{primaryHint("s")}</span>
          {active.dirty && (
            <button
              onClick={active.discard}
              disabled={active.saving}
              className="rounded-lg bg-[var(--bg-secondary)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] shadow-lg transition-all hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              Discard
            </button>
          )}
          <button
            onClick={active.handleSave}
            disabled={!active.dirty || active.saving || Boolean(active.validationError)}
            className="rounded-lg bg-[var(--text-primary)] px-3.5 py-1.5 text-xs font-medium text-[var(--bg-primary)] shadow-lg transition-all hover:opacity-85 disabled:opacity-40"
          >
            {active.saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}

      <AIGenerateModal
        open={aiOpen}
        scope={projectName}
        current={userEditor.content}
        onCancel={() => setAiOpen(false)}
        onGenerate={handleAIGenerate}
        onApply={applyGenerated}
      />
    </div>
  );
}
