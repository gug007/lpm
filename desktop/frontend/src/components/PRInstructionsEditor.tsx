import {
  ReadPRTitleInstructions,
  SavePRTitleInstructions,
  ReadPRDescriptionInstructions,
  SavePRDescriptionInstructions,
} from "../../wailsjs/go/main/App";
import { useYamlEditor } from "../hooks/useYamlEditor";
import { ChevronLeftIcon } from "./icons";

export function PRInstructionsEditor({ onBack }: { onBack: () => void }) {
  const title = useYamlEditor(ReadPRTitleInstructions, SavePRTitleInstructions);
  const desc = useYamlEditor(ReadPRDescriptionInstructions, SavePRDescriptionInstructions);

  const dirty = title.dirty || desc.dirty;
  const saving = title.saving || desc.saving;
  const error = title.error || desc.error;

  const handleSave = async () => {
    await Promise.all([
      title.dirty ? title.handleSave() : undefined,
      desc.dirty ? desc.handleSave() : undefined,
    ]);
  };

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
        <h1 className="text-lg font-semibold tracking-tight">PR Instructions</h1>
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        Custom instructions for AI-generated pull request titles and descriptions. Applied globally to all projects.
      </p>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
        {/* Title instructions */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-[var(--text-muted)]">Title</span>
          <textarea
            value={title.content}
            onChange={(e) => title.setContent(e.target.value)}
            spellCheck={false}
            rows={3}
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-xs leading-relaxed text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
            placeholder={"Keep under 70 characters.\nStart with a verb (Add, Fix, Update, Refactor, etc.).\nBe descriptive but concise."}
          />
        </div>

        {/* Description instructions */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <span className="text-[11px] font-medium text-[var(--text-muted)]">Description</span>
          <textarea
            value={desc.content}
            onChange={(e) => desc.setContent(e.target.value)}
            spellCheck={false}
            className="min-h-0 flex-1 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-xs leading-relaxed text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
            placeholder={"Start with a brief summary (2-3 sentences max).\nInclude a bulleted list of key changes.\nKeep it concise but informative."}
          />
        </div>
      </div>

      {(dirty || error) && (
        <div className="mt-3 flex shrink-0 items-center justify-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
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
  );
}
