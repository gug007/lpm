import { useState } from "react";
import { ConfigEditor } from "../ConfigEditor";
import { AIButton } from "../ui/AIButton";
import { AlertCircleIcon, SettingsIcon } from "../icons";
import { configProblems } from "../../configProblems";
import { useAIPicker } from "../../hooks/useAIPicker";

interface ConfigErrorViewProps {
  projectName: string;
  error: string;
  showProjectName: boolean;
  sidebarCollapsed: boolean;
  showConfigEditor: boolean;
  isRemote: boolean;
  onShowConfigEditor: () => void;
  onCloseConfigEditor: () => void;
  onRefresh: (newName?: string) => void;
}

export function ConfigErrorView({
  projectName,
  error,
  showProjectName,
  sidebarCollapsed,
  showConfigEditor,
  isRemote,
  onShowConfigEditor,
  onCloseConfigEditor,
  onRefresh,
}: ConfigErrorViewProps) {
  const [startWith, setStartWith] = useState<"line" | "fix">();
  const aiAvailable = useAIPicker(!showConfigEditor).anyAvailable;
  const problem = configProblems(error)[0];

  const openEditor = (how?: "line" | "fix") => {
    setStartWith(how);
    onShowConfigEditor();
  };

  return (
    <div className="flex h-full flex-col">
      <div className={`app-drag flex items-center gap-4 -mx-3 py-1 transition-[padding] duration-200 ${sidebarCollapsed ? "pl-[100px] native-chrome:pl-8" : ""}`}>
        {showProjectName && (
          <h1 className="shrink-0 text-xl font-semibold tracking-tight">{projectName}</h1>
        )}
      </div>
      {showConfigEditor ? (
        <div className="mt-1.5 -mx-6 -mb-6 flex flex-1 flex-col overflow-hidden">
          <ConfigEditor
            projectName={projectName}
            onSaved={onRefresh}
            back={{ label: projectName, onClick: onCloseConfigEditor }}
            isRemote={isRemote}
            loadError={error}
            startWith={startWith}
          />
        </div>
      ) : (
        <div className="mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
          <div role="alert" className="flex w-full max-w-md flex-col items-center gap-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-500">
              <AlertCircleIcon />
            </div>
            <p className="text-sm font-medium text-[var(--text-primary)]">This project's config doesn't load</p>
            <div className="flex w-full flex-col gap-1.5 rounded-lg bg-[var(--bg-sidebar)] p-4 text-left">
              {problem && (
                <span className="text-[11px] font-medium text-[var(--text-muted)]">Line {problem.line}</span>
              )}
              <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--accent-red-text)]">
                {problem?.message ?? error}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => openEditor(problem ? "line" : undefined)}
                className="flex items-center gap-2 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-85"
              >
                <SettingsIcon />
                {problem ? `Go to line ${problem.line}` : "Edit Config"}
              </button>
              {aiAvailable && (
                <AIButton onClick={() => openEditor("fix")} title="Open the config and have AI fix this problem">
                  Fix with AI
                </AIButton>
              )}
              <button
                onClick={() => onRefresh()}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
