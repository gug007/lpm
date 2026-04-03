import { ReadGlobalConfig, SaveGlobalConfig } from "../../wailsjs/go/main/App";
import { useYamlEditor } from "../hooks/useYamlEditor";
import { ChevronLeftIcon } from "./icons";

const load = () => ReadGlobalConfig();
const save = (content: string) => SaveGlobalConfig(content);

export function GlobalConfigEditor({ onBack }: { onBack: () => void }) {
  const { content, setContent, dirty, saving, error, handleSave, handleTab } =
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
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        Actions and terminals defined here are available in every project.
      </p>

      <div className="mt-4 flex min-h-0 flex-1 flex-col relative rounded-lg border border-[var(--border)] overflow-hidden">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleTab}
          spellCheck={false}
          className="min-h-0 flex-1 w-full resize-none bg-[var(--bg-primary)] px-4 py-3 font-mono text-xs leading-relaxed text-[var(--text-primary)] outline-none"
          style={{ tabSize: 2 }}
          placeholder={"actions:\n  deploy:\n    cmd: ./deploy.sh\n\nterminals:\n  logs:\n    cmd: tail -f /var/log/app.log"}
        />
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
