import { chordLabel } from "../../keys";
import { basename } from "../../path";
import { DEFAULT_STATUS, STATUS_DISPLAY } from "../ChangedFilesTree";
import { LineCounts } from "../LineCounts";
import { FileTypeIcon } from "./FileTypeIcon";
import type { ChangedFile } from "./useChangedFiles";

const SHOWN_MAX = 50;

interface FilesStartProps {
  files: ChangedFile[];
  lineCounts: ReadonlyMap<string, { added: number; removed: number }> | null;
  onOpen: (path: string) => void;
  onReviewAll: () => void;
}

function parentDir(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut > 0 ? path.slice(0, cut) : "";
}

// What the Files tab shows before a file is open, while the working tree has
// uncommitted changes: those files, each one click from its diff.
export function FilesStart({ files, lineCounts, onOpen, onReviewAll }: FilesStartProps) {
  let added = 0;
  let removed = 0;
  for (const c of lineCounts?.values() ?? []) {
    added += c.added;
    removed += c.removed;
  }
  const shown = files.slice(0, SHOWN_MAX);
  const more = files.length - shown.length;

  return (
    <div className="h-full overflow-auto px-6 py-7">
      <div className="mx-auto flex max-w-[640px] flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[var(--text-primary)]">Uncommitted changes</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              {files.length} {files.length === 1 ? "file" : "files"}
              {lineCounts && <LineCounts added={added} removed={removed} />}
            </div>
          </div>
          <button
            type="button"
            onClick={onReviewAll}
            className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Review all
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
          {shown.map((file, i) => {
            const { label, color } = STATUS_DISPLAY[file.status] ?? DEFAULT_STATUS;
            const lines = lineCounts?.get(file.path);
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => onOpen(file.path)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors hover:bg-[var(--bg-hover)] ${
                  i > 0 ? "border-t border-[var(--border)]" : ""
                }`}
              >
                <FileTypeIcon name={basename(file.path)} />
                <span className="shrink-0 font-medium text-[var(--text-primary)]">{basename(file.path)}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)]">
                  {parentDir(file.path)}
                </span>
                {lines && <LineCounts added={lines.added} removed={lines.removed} className="shrink-0 text-[11px]" />}
                <span className={`w-3 shrink-0 text-center text-[11px] font-bold ${color}`} title={file.status}>
                  {label}
                </span>
              </button>
            );
          })}
          {more > 0 && (
            <button
              type="button"
              onClick={onReviewAll}
              className="w-full border-t border-[var(--border)] px-3 py-2 text-left text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              {more} more — review them all
            </button>
          )}
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">
          Pick any file from the tree, or press {chordLabel({ key: "p", meta: true })} to jump to one by name or path.
        </p>
      </div>
    </div>
  );
}
