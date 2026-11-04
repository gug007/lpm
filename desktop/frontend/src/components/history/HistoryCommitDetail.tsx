import { SetClipboardText } from "../../../bridge/commands";
import { count } from "../../count";
import { coAuthorName, commitAgent, commitBody, lineTotals, type HistoryCommit } from "../../gitHistory";
import { toast } from "../../notifications/toast";
import { fullStamp } from "../../relativeTime";
import { DiffViewer } from "../DiffViewer";
import { ClipboardIcon } from "../icons";
import { LineCounts } from "../LineCounts";
import { AgentGlyph } from "../terminal/AgentGlyph";
import { HistoryFileRow } from "./HistoryFileRow";
import { useCommitFiles } from "./useCommitFiles";

/** One commit: its message, who wrote it, the files it changed and the
 *  picked file's patch. */
export function HistoryCommitDetail({ projectPath, commit }: { projectPath: string; commit: HistoryCommit }) {
  const { files, error, selected, select, patch, patchLoading } = useCommitFiles(projectPath, commit.hash);
  const agent = commitAgent(commit);
  const body = commitBody(commit.body);
  const totals = files ? lineTotals(files) : null;

  const copyHash = async () => {
    try {
      await SetClipboardText(commit.hash);
      toast.success("Commit hash copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-[var(--border)] px-4 py-3">
        <div className="text-[14px] font-medium leading-snug text-[var(--text-primary)]">{commit.subject}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
          <button
            type="button"
            onClick={() => void copyHash()}
            title="Copy the full hash"
            className="flex items-center gap-1 rounded px-1 font-mono text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] [&_svg]:h-3 [&_svg]:w-3"
          >
            {commit.short}
            <ClipboardIcon />
          </button>
          <span>·</span>
          <span title={commit.email}>{commit.author}</span>
          <span>·</span>
          <span>{fullStamp(commit.time)}</span>
          {commit.parents > 1 && (
            <>
              <span>·</span>
              <span>Merge</span>
            </>
          )}
        </div>
        {commit.coAuthors.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
            {agent && <AgentGlyph agent={agent} size={12} />}
            with {commit.coAuthors.map(coAuthorName).join(", ")}
          </div>
        )}
        {body && (
          <p className="max-h-28 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--text-secondary)]">
            {body}
          </p>
        )}
      </div>
      <div className="max-h-[35%] shrink-0 overflow-y-auto border-b border-[var(--border)] px-2 py-2">
        <div className="flex items-center gap-2 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {files === null && !error ? "Files" : count(files?.length ?? 0, "file", "files")}
          {totals && <LineCounts {...totals} className="normal-case tracking-normal" />}
        </div>
        {error && <div className="px-2 py-1 text-[12px] text-[var(--accent-red-text)]">{error}</div>}
        {files?.length === 0 && (
          <div className="px-2 py-1 text-[12px] text-[var(--text-muted)]">This commit changes no files.</div>
        )}
        {files?.map((file) => (
          <HistoryFileRow
            key={`${file.oldPath ?? ""}:${file.path}`}
            file={file}
            selected={selected?.path === file.path}
            onSelect={() => select(file)}
          />
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {selected && <DiffViewer diff={patch} loading={patchLoading} filePath={selected.path} />}
      </div>
    </div>
  );
}
