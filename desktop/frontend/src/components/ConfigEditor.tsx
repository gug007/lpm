import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "../notifications/toast";
import {
  ReadConfig,
  SaveConfig,
  ReadRepoConfig,
  GenerateProjectConfig,
} from "../../bridge/commands";
import { BrowserOpenURL } from "../../bridge/runtime";
import { stripMarker } from "../peer/markers";
import { useYamlEditor } from "../hooks/useYamlEditor";
import { projectGlobalLayer, projectLayer, queueWrite, repoLayer, saveLayer } from "../yamlQueue";
import { VisualConfigEditor } from "./VisualConfigEditor";
import { MonacoEditor } from "./MonacoEditor";
import {
  PROJECT_MODEL_URI,
  REPO_MODEL_URI,
  GLOBAL_MODEL_URI,
} from "../monaco-uris";
import { ArrowUpRight, Settings, Sparkles } from "lucide-react";
import { SegmentedControl } from "./ui/SegmentedControl";
import { BTN_SECONDARY } from "./ui/buttons";
import type { PageBack } from "./ui/PageHeader";
import { ProjectSubpage, SUBPAGE_COLUMN } from "./project-detail/ProjectSubpage";
import { AIGenerateModal } from "./AIGenerateModal";
import { type AICLI } from "../types";
import { getSettings, saveSettings } from "../store/settings";
import { validateYaml } from "../yamlValidation";
import { configProblems, type ConfigProblem } from "../configProblems";
import { useConfigFix } from "../hooks/useConfigFix";
import { ConfigProblemNotice } from "./ConfigProblemNotice";
import { ConfigSaveBar } from "./config-form/ConfigSaveBar";

type ConfigTarget = "user" | "repo" | "global";

const USER_TARGET = {
  value: "user" as const,
  label: "This project",
  tooltip: "Your personal settings for this project, kept in lpm. Only you see them.",
};
const REPO_TARGET = {
  value: "repo" as const,
  label: "Shared",
  tooltip:
    "The .lpm.yml inside the project folder. Anyone who opens this project gets the same actions, services, and profiles.",
};
const GLOBAL_TARGET = {
  value: "global" as const,
  label: "All projects",
  tooltip: "global.yml: defaults shared across all your projects, used where a project doesn't override them.",
};

// Which file each scope edits, said under the switch.
function targetFile(target: ConfigTarget, projectName: string): { path: string; note: string } {
  if (target === "repo") return { path: ".lpm.yml", note: "in the project folder, committed with the code for everyone who opens it" };
  if (target === "global") return { path: "~/.lpm/global.yml", note: "defaults every project uses unless it sets its own" };
  return { path: `~/.lpm/projects/${stripMarker(projectName)}.yml`, note: "your own settings for this project, kept in lpm" };
}

const MODE_OPTIONS = [
  { value: "form" as const, label: "Form" },
  { value: "yaml" as const, label: "YAML" },
];

interface ConfigEditorProps {
  projectName: string;
  onSaved: (newName: string) => void;
  // The page's back link.
  back: PageBack;
  isRemote?: boolean;
  // Why the project's own file doesn't load, as the project page reported it.
  loadError?: string;
  // Opened from that error: at the line it names, or asking AI for a fix.
  startWith?: "line" | "fix";
}

export function ConfigEditor({
  projectName,
  onSaved,
  back,
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

  const headerActions = (
    <span
      className={target === "user" ? "" : "invisible pointer-events-none"}
      aria-hidden={target !== "user"}
    >
      <button
        type="button"
        onClick={() => setAiOpen(true)}
        title="Generate config with AI"
        className={`flex h-8 items-center gap-1.5 ${BTN_SECONDARY}`}
      >
        <Sparkles size={13} strokeWidth={1.9} className="text-[var(--text-secondary)]" />
        Generate with AI
      </button>
    </span>
  );
  const file = targetFile(target, projectName);
  const toolbar = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {targets.length > 1 && (
        <span className="flex items-center gap-2">
          <span className="text-[12px] text-[var(--text-secondary)]">Editing</span>
          <SegmentedControl value={target} onChange={changeTarget} options={targets} ariaLabel="Config file to edit" />
        </span>
      )}
      {target === "user" && (
        <span className="ml-auto">
          <SegmentedControl value={mode} onChange={changeMode} options={MODE_OPTIONS} ariaLabel="Editor view" />
        </span>
      )}
      {targets.length > 1 && (
        <p className="w-full text-[12px] text-[var(--text-muted)]">
          Edits <span className="font-mono text-[var(--text-secondary)]">{file.path}</span>: {file.note}.
        </p>
      )}
    </div>
  );
  const description = (
    <>
      Services, actions and profiles lpm runs for this project.{" "}
      <button
        type="button"
        onClick={() => BrowserOpenURL("https://lpm.cx/docs")}
        className="inline-flex items-center gap-0.5 text-[var(--text-secondary)] underline decoration-[var(--border)] underline-offset-2 transition-colors hover:text-[var(--text-primary)] hover:decoration-current"
      >
        Config reference
        <ArrowUpRight size={11} strokeWidth={2} />
      </button>
    </>
  );

  const body =
    effectiveMode === "form" ? (
      <VisualConfigEditor
        content={active.content}
        onChange={active.setContent}
        onEditYaml={() => (firstProblem ? goToProblem(firstProblem) : changeMode("yaml"))}
        isRemote={isRemote}
      />
    ) : (
      <div className={`${SUBPAGE_COLUMN} flex min-h-0 flex-1 flex-col pb-5`}>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--border)]">
          {(active.loaded || active.error) && (
            <MonacoEditor
              key={modelUri}
              value={active.content}
              onChange={active.setContent}
              language="yaml"
              modelUri={modelUri}
              onSave={active.handleSave}
              onToggleView={back.onClick}
              readOnly={fixer.fixing}
              reveal={goTo}
              jumpTo={goTo}
              problems={problems}
            />
          )}
        </div>
      </div>
    );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" onKeyDown={active.handleSaveKey}>
      <ProjectSubpage
        back={back}
        title="Config"
        icon={Settings}
        description={description}
        actions={headerActions}
        toolbar={toolbar}
        scroll={effectiveMode === "form"}
      >
        {body}
      </ProjectSubpage>

      <ConfigSaveBar
        dirty={active.dirty}
        saving={active.saving}
        invalid={Boolean(active.validationError)}
        notice={
          shownError ? (
            <ConfigProblemNotice
              message={shownError}
              goTo={firstProblem && { line: firstProblem.line, onClick: () => goToProblem(firstProblem) }}
              fix={
                fixer.available
                  ? { fixing: fixer.fixing, onFix: () => void fixWithAI(active, shownError), onCancel: fixer.cancel }
                  : undefined
              }
            />
          ) : undefined
        }
        onDiscard={active.discard}
        onSave={active.handleSave}
      />

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
