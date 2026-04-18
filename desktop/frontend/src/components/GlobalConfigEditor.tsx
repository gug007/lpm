import { ReadGlobalConfig, SaveGlobalConfig } from "../../wailsjs/go/main/App";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { useYamlEditor } from "../hooks/useYamlEditor";
import { ChevronLeftIcon } from "./icons";
import { MonacoYamlEditor } from "./MonacoYamlEditor";
import { GLOBAL_MODEL_URI } from "../monaco-setup";

const load = () => ReadGlobalConfig();
const save = (content: string) => SaveGlobalConfig(content);

export function GlobalConfigEditor({ onBack }: { onBack: () => void }) {
  const { content, setContent, dirty, saving, error, handleSave } =
    useYamlEditor(load, save);

  return (
    <div className="flex flex-1 flex-col pt-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="Back to Settings"
        >
          <ChevronLeftIcon />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">Global Config</h1>
        <button
          onClick={() => BrowserOpenURL("https://lpm.cx/config#global-config")}
          className="ml-auto rounded px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="Open configuration reference"
        >
          Docs
        </button>
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        Actions and terminals defined here are available in every project.
      </p>

      <div className="mt-4 flex min-h-0 flex-1 flex-col relative rounded-lg border border-[var(--border)] overflow-hidden">
        <div className="min-h-0 flex-1">
          <MonacoYamlEditor
            value={content}
            onChange={setContent}
            modelUri={GLOBAL_MODEL_URI}
            onSave={handleSave}
          />
        </div>
        {(dirty || error) && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
            {error && (
              <span className="flex-1 text-xs text-[var(--accent-red)]">{error}</span>
            )}
            <span className="text-[10px] text-[var(--text-muted)]">{"\u2318"}S</span>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="rounded-md bg-[var(--text-primary)] px-3 py-1 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-85 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
