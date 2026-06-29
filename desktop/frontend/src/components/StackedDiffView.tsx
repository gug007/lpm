import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import parseDiff from "parse-diff";
import { type Token, getLang, ensureLang, tokenizeLines } from "../highlight";

export type FileStatus = "modified" | "added" | "deleted" | "renamed" | "binary";

interface DiffLine {
  type: "context" | "add" | "del" | "empty";
  content: string;
  lineNo?: number;
  tokens?: Token[];
}

interface DiffRow {
  left: DiffLine;
  right: DiffLine;
  hunkHeader?: string;
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  status: FileStatus;
  rows: DiffRow[];
}

export const BASE_DIFF_FONT_PX = 11;
const DIFF_LINE_HEIGHT = 1.6;
const LAZY_ROOT_MARGIN_PX = 400;

const STATUS_BADGE: Record<FileStatus, string> = {
  modified: "",
  added: "bg-green-500/15 text-green-400",
  deleted: "bg-red-500/15 text-red-400",
  renamed: "bg-blue-500/15 text-blue-400",
  binary: "bg-[var(--bg-hover)] text-[var(--text-muted)]",
};

// Git emits hunk headers like `@@ -1,98 +1,110 @@ functionName(...)`. The
// numeric range is noise to a reader; the optional trailing context (the name
// of the enclosing function) is the useful part.
const HUNK_PREFIX_RE = /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@\s?/;

const stripPath = (p?: string) => (!p || p === "/dev/null" ? undefined : p);

function fileStatus(file: parseDiff.File): FileStatus {
  if (file.deleted) return "deleted";
  if (file.new) return "added";
  if (file.from && file.to && file.from !== file.to) return "renamed";
  // parse-diff returns no chunks for binary diffs ("Binary files ... differ").
  if (file.chunks.length === 0) return "binary";
  return "modified";
}

export function parseSideBySide(raw: string): FileDiff[] {
  return parseDiff(raw)
    .map((file): FileDiff | null => {
      const from = stripPath(file.from);
      const to = stripPath(file.to);
      const path = to ?? from ?? "";
      if (!path) return null;
      const status = fileStatus(file);
      const oldPath = from && to && from !== to ? from : undefined;

      const rows: DiffRow[] = [];
      let dels: parseDiff.DeleteChange[] = [];
      let adds: parseDiff.AddChange[] = [];

      const flush = () => {
        const max = Math.max(dels.length, adds.length);
        for (let j = 0; j < max; j++) {
          rows.push({
            left:
              j < dels.length
                ? { type: "del", content: dels[j].content.slice(1), lineNo: dels[j].ln }
                : { type: "empty", content: "" },
            right:
              j < adds.length
                ? { type: "add", content: adds[j].content.slice(1), lineNo: adds[j].ln }
                : { type: "empty", content: "" },
          });
        }
        dels = [];
        adds = [];
      };

      file.chunks.forEach((chunk, i) => {
        if (i > 0) {
          rows.push({
            left: { type: "empty", content: "" },
            right: { type: "empty", content: "" },
            hunkHeader: chunk.content,
          });
        }
        for (const change of chunk.changes) {
          if (change.type === "normal") {
            flush();
            const content = change.content.slice(1);
            rows.push({
              left: { type: "context", content, lineNo: change.ln1 },
              right: { type: "context", content, lineNo: change.ln2 },
            });
          } else if (change.type === "del") {
            dels.push(change);
          } else {
            adds.push(change);
          }
        }
        flush();
      });

      return { path, oldPath, status, rows };
    })
    .filter((f): f is FileDiff => f !== null);
}

async function highlightDiffs(diffs: FileDiff[]): Promise<FileDiff[]> {
  return Promise.all(
    diffs.map(async (file) => {
      const lang = getLang(file.path);
      if (!lang || !(await ensureLang(lang))) return file;

      const leftLines: string[] = [];
      const rightLines: string[] = [];
      const leftIdx: number[] = [];
      const rightIdx: number[] = [];

      file.rows.forEach((row, i) => {
        if (row.left.type !== "empty") {
          leftIdx.push(i);
          leftLines.push(row.left.content);
        }
        if (row.right.type !== "empty") {
          rightIdx.push(i);
          rightLines.push(row.right.content);
        }
      });

      const leftTokens = await tokenizeLines(leftLines.join("\n"), lang);
      const rightTokens = await tokenizeLines(rightLines.join("\n"), lang);

      const newRows: DiffRow[] = file.rows.map((r) => ({
        left: { ...r.left },
        right: { ...r.right },
      }));

      leftTokens.forEach((tokens, i) => {
        if (i < leftIdx.length) newRows[leftIdx[i]].left.tokens = tokens;
      });
      rightTokens.forEach((tokens, i) => {
        if (i < rightIdx.length) newRows[rightIdx[i]].right.tokens = tokens;
      });

      return { ...file, rows: newRows };
    }),
  );
}

const rowBg = (type: DiffLine["type"]) => {
  switch (type) {
    case "add":
      return "bg-green-500/10";
    case "del":
      return "bg-red-500/10";
    case "empty":
      return "diff-empty-hatch";
    default:
      return "";
  }
};

function HunkSeparator({ header }: { header: string }) {
  const context = header.replace(HUNK_PREFIX_RE, "").trim();
  return (
    <div className="sticky left-0 flex h-5 items-center bg-[var(--bg-secondary)] text-[var(--text-muted)]">
      {context && (
        <span className="truncate px-3 text-[0.85em] italic">{context}</span>
      )}
    </div>
  );
}

function DiffPlaceholder({ rowCount, fontPx }: { rowCount: number; fontPx: number }) {
  const height = Math.max(40, Math.ceil(rowCount * fontPx * DIFF_LINE_HEIGHT));
  return <div aria-hidden style={{ height: `${height}px` }} />;
}

function DiffSide({
  rows,
  side,
  withBorder,
}: {
  rows: DiffRow[];
  side: "left" | "right";
  withBorder?: boolean;
}) {
  return (
    <div
      className={`min-w-0 flex-1 overflow-x-auto ${withBorder ? "border-r border-[var(--border)]" : ""}`}
    >
      {rows.map((row, i) => {
        if (row.hunkHeader) return <HunkSeparator key={i} header={row.hunkHeader} />;
        const line = side === "left" ? row.left : row.right;
        return (
          <div key={i} className={`flex w-max min-w-full ${rowBg(line.type)}`}>
            <span className="sticky left-0 z-[1] w-10 shrink-0 select-none bg-[var(--bg-primary)] pr-2 text-right text-[0.9em] text-[var(--text-muted)]">
              {line.lineNo ?? ""}
            </span>
            <span className="whitespace-pre pr-4">{renderContent(line)}</span>
          </div>
        );
      })}
    </div>
  );
}

function renderContent(line: DiffLine): ReactNode {
  if (line.type === "empty") return " ";
  if (line.tokens && line.tokens.length > 0) {
    return line.tokens.map((t, i) => (
      <span key={i} style={t.color ? { color: t.color } : undefined}>
        {t.content}
      </span>
    ));
  }
  return line.content || " ";
}

export interface StackedDiffHandle {
  scrollToFile: (path: string) => void;
}

interface StackedDiffViewProps {
  // Raw unified diff text. Parsed and syntax-highlighted internally.
  diffText: string;
  // External fetch in progress — shows a loading state until diffText arrives.
  loading?: boolean;
  fontSize: number;
  // When given, files not in the set dim and show "(excluded)" (commit flow).
  selected?: Set<string>;
}

// The VS Code "all changes" stacked diff: every file's side-by-side diff in one
// scrollable column, lazily mounted as it scrolls into view so a large changeset
// doesn't pay to render every row up front.
export const StackedDiffView = forwardRef<StackedDiffHandle, StackedDiffViewProps>(
  function StackedDiffView(
    { diffText, loading = false, fontSize, selected },
    ref,
  ) {
    const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([]);
    const [mounted, setMounted] = useState<Set<string>>(new Set());
    const diffRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
      // Re-lazy-mount from scratch when the input diff changes (the async
      // highlight pass below only swaps tokens into already-mounted files).
      setMounted(new Set());
      if (!diffText) {
        setFileDiffs([]);
        return;
      }
      let cancelled = false;
      const parsed = parseSideBySide(diffText);
      setFileDiffs(parsed);
      highlightDiffs(parsed)
        .then((hl) => {
          if (!cancelled) setFileDiffs(hl);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [diffText]);

    useEffect(() => {
      const root = scrollContainerRef.current;
      if (!root) return;
      const observer = new IntersectionObserver(
        (entries) => {
          const seen: string[] = [];
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const path = (entry.target as HTMLElement).dataset.filePath;
            if (path) {
              seen.push(path);
              observer.unobserve(entry.target);
            }
          }
          if (seen.length === 0) return;
          setMounted((prev) => {
            const next = new Set(prev);
            for (const p of seen) next.add(p);
            return next;
          });
        },
        { root, rootMargin: `${LAZY_ROOT_MARGIN_PX}px 0px` },
      );
      observerRef.current = observer;
      diffRefs.current.forEach((el) => observer.observe(el));
      return () => {
        observer.disconnect();
        observerRef.current = null;
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        scrollToFile: (path: string) => {
          // Force-mount the target so scrollIntoView lands on real content
          // rather than a placeholder that may be slightly off in height.
          setMounted((prev) => {
            if (prev.has(path)) return prev;
            const next = new Set(prev);
            next.add(path);
            return next;
          });
          requestAnimationFrame(() => {
            diffRefs.current
              .get(path)
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        },
      }),
      [],
    );

    return (
      <div ref={scrollContainerRef} className="min-w-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="py-10 text-center text-[11px] text-[var(--text-muted)]">
            Loading diffs...
          </div>
        )}
        {!loading && fileDiffs.length === 0 && (
          <div className="py-10 text-center text-[11px] text-[var(--text-muted)]">
            No changes to display
          </div>
        )}
        {!loading &&
          fileDiffs.map((file) => {
            const isMounted = mounted.has(file.path);
            const isExcluded = selected ? !selected.has(file.path) : false;
            return (
              <div
                key={file.path}
                data-file-path={file.path}
                ref={(el) => {
                  const prev = diffRefs.current.get(file.path);
                  if (prev && prev !== el) {
                    observerRef.current?.unobserve(prev);
                  }
                  if (el) {
                    diffRefs.current.set(file.path, el);
                    if (!isMounted) observerRef.current?.observe(el);
                  } else {
                    diffRefs.current.delete(file.path);
                  }
                }}
                className={`border-b border-[var(--border)] last:border-b-0 ${
                  isExcluded ? "opacity-60" : ""
                }`}
              >
                <div
                  className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-[11px] font-medium text-[var(--text-primary)]"
                >
                  {file.status === "renamed" && file.oldPath && (
                    <span className="text-[var(--text-muted)]">{file.oldPath} →</span>
                  )}
                  <span className="truncate">{file.path}</span>
                  {file.status !== "modified" && (
                    <span
                      className={`shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${STATUS_BADGE[file.status]}`}
                    >
                      {file.status}
                    </span>
                  )}
                  {isExcluded && (
                    <span className="ml-2 text-[10px] font-normal text-[var(--text-muted)]">
                      (excluded)
                    </span>
                  )}
                </div>
                {file.status === "binary" ? (
                  <div className="px-4 py-3 text-[11px] italic text-[var(--text-muted)]">
                    Binary file — diff not shown
                  </div>
                ) : isMounted ? (
                  <div
                    className="flex font-mono leading-[1.6]"
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    <DiffSide rows={file.rows} side="left" withBorder />
                    <DiffSide rows={file.rows} side="right" />
                  </div>
                ) : (
                  <DiffPlaceholder rowCount={file.rows.length} fontPx={fontSize} />
                )}
              </div>
            );
          })}
      </div>
    );
  },
);
