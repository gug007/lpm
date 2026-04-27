import { ConfigEditor } from "../ConfigEditor";
import { AlertCircleIcon, PencilIcon } from "../icons";

interface ConfigErrorViewProps {
  projectName: string;
  error: string;
  showProjectName: boolean;
  sidebarCollapsed: boolean;
  showConfigEditor: boolean;
  onShowConfigEditor: () => void;
  onCloseConfigEditor: () => void;
  onRefresh: (newName?: string) => void;
}

// Replaces the project view when the YAML fails to load — surfaces the
// parse error, lets the user open the config editor inline, and offers
// a retry that re-runs ListProjects.
export function ConfigErrorView({
  projectName,
  error,
  showProjectName,
  sidebarCollapsed,
  showConfigEditor,
  onShowConfigEditor,
  onCloseConfigEditor,
  onRefresh,
}: ConfigErrorViewProps) {
  return (
    <div className="flex h-full flex-col">
      <div className={`wails-drag flex items-center gap-4 -mx-3 py-1 transition-[padding] duration-200 ${sidebarCollapsed ? "pl-[100px]" : ""}`}>
        {showProjectName && (
          <h1 className="shrink-0 text-xl font-semibold tracking-tight">{projectName}</h1>
        )}
      </div>
      {showConfigEditor ? (
        <div className="mt-1.5 -mx-6 -mb-6 flex flex-1 flex-col overflow-hidden">
          <ConfigEditor
            projectName={projectName}
            onSaved={onRefresh}
            onBack={onCloseConfigEditor}
            onToggleView={onCloseConfigEditor}
          />
        </div>
      ) : (
        <div className="mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-500">
              <AlertCircleIcon />
            </div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Invalid configuration</p>
            <pre className="whitespace-pre-wrap rounded-lg bg-[var(--bg-sidebar)] p-4 text-left text-xs text-red-400 w-full">{error}</pre>
            <div className="flex items-center gap-3">
              <button
                onClick={onShowConfigEditor}
                className="flex items-center gap-2 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-85"
              >
                <PencilIcon />
                Edit Config
              </button>
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
