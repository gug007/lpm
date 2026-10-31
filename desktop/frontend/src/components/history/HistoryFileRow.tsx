import type { CommitFile } from "../../gitHistory";
import { DEFAULT_STATUS, STATUS_DISPLAY } from "../ChangedFilesTree";
import { LineCounts } from "../LineCounts";

export function HistoryFileRow({
  file,
  selected,
  onSelect,
}: {
  file: CommitFile;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = STATUS_DISPLAY[file.status] ?? DEFAULT_STATUS;
  const slash = file.path.lastIndexOf("/");
  const dir = slash >= 0 ? file.path.slice(0, slash + 1) : "";
  const name = file.path.slice(slash + 1);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected || undefined}
      title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-[12px] transition-colors ${
        selected ? "bg-[var(--bg-active)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
      }`}
    >
      <span className={`w-3 shrink-0 font-semibold ${status.color}`} aria-label={file.status}>
        {status.label}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="text-[var(--text-muted)]">{dir}</span>
        {name}
      </span>
      {file.added === null ? (
        <span className="shrink-0 text-[11px] text-[var(--text-muted)]">binary</span>
      ) : (
        <LineCounts added={file.added} removed={file.removed ?? 0} className="shrink-0 text-[11px]" />
      )}
    </button>
  );
}
