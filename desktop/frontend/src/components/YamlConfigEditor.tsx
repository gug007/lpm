import { type ReactNode } from "react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { useYamlEditor } from "../hooks/useYamlEditor";
import { validateYaml } from "../yamlValidation";
import { ChevronLeftIcon } from "./icons";
import { MonacoEditor } from "./MonacoEditor";

interface YamlConfigEditorProps {
  title: string;
  description: ReactNode;
  modelUri: string;
  load: () => Promise<string>;
  save: (content: string) => Promise<void>;
  onBack: () => void;
  docsUrl?: string;
}

export function YamlConfigEditor({
  title,
  description,
  modelUri,
  load,
  save,
  onBack,
  docsUrl,
}: YamlConfigEditorProps) {
  const {
    content,
    setContent,
    dirty,
    saving,
    error,
    validationError,
    handleSave,
  } = useYamlEditor(load, save, validateYaml);
  const activeError = validationError ?? error;

  return (
    <div className="flex flex-1 flex-col pt-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="Back"
        >
          <ChevronLeftIcon />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {docsUrl && (
          <button
            onClick={() => BrowserOpenURL(docsUrl)}
            className="ml-auto rounded px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title="Open configuration reference"
          >
            Docs
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">{description}</p>

      <div className="mt-4 flex min-h-0 flex-1 flex-col relative rounded-lg border border-[var(--border)] overflow-hidden">
        <div className="min-h-0 flex-1">
          <MonacoEditor
            value={content}
            onChange={setContent}
            language="yaml"
            modelUri={modelUri}
            onSave={handleSave}
          />
        </div>
        {(dirty || activeError) && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
            {activeError && (
              <span className="flex-1 text-xs text-[var(--accent-red)]">{activeError}</span>
            )}
            <span className="text-[10px] text-[var(--text-muted)]">{"⌘"}S</span>
            <button
              onClick={handleSave}
              disabled={!dirty || saving || Boolean(validationError)}
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
