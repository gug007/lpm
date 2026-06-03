import { useYamlEditor } from "../hooks/useYamlEditor";
import {
  DEFAULT_PR_TITLE_INSTRUCTIONS,
  DEFAULT_PR_DESCRIPTION_INSTRUCTIONS,
} from "../aiInstructions";

interface PRInstructionsFormProps {
  titleLoad: () => Promise<string>;
  titleSave: (content: string) => Promise<void>;
  descLoad: () => Promise<string>;
  descSave: (content: string) => Promise<void>;
}

export function PRInstructionsForm({
  titleLoad,
  titleSave,
  descLoad,
  descSave,
}: PRInstructionsFormProps) {
  const title = useYamlEditor(titleLoad, titleSave);
  const desc = useYamlEditor(descLoad, descSave);

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
    <>
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-[var(--text-muted)]">Title</span>
          <textarea
            value={title.content}
            onChange={(e) => title.setContent(e.target.value)}
            spellCheck={false}
            rows={3}
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-xs leading-relaxed text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
            placeholder={DEFAULT_PR_TITLE_INSTRUCTIONS}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <span className="text-[11px] font-medium text-[var(--text-muted)]">Description</span>
          <textarea
            value={desc.content}
            onChange={(e) => desc.setContent(e.target.value)}
            spellCheck={false}
            className="min-h-0 flex-1 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3 text-xs leading-relaxed text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
            placeholder={DEFAULT_PR_DESCRIPTION_INSTRUCTIONS}
          />
        </div>
      </div>

      {(dirty || error) && (
        <div className="mt-3 flex shrink-0 items-center justify-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
          {error && (
            <span className="flex-1 text-xs text-[var(--accent-red)]">{error}</span>
          )}
          <span className="text-[10px] text-[var(--text-muted)]">{"⌘"}S</span>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="rounded-md bg-[var(--text-primary)] px-3 py-1 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-85 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </>
  );
}
