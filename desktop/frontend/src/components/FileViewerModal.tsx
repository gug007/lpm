import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "./ui/Modal";
import { XIcon } from "./icons";
import { GitDiff, ReadFile, WriteFile } from "../../wailsjs/go/main/App";
import { ensureLang, getLang, tokenizeLines, type Token } from "../highlight";
import { basename, relTo } from "../path";
import { MonacoEditor } from "./MonacoEditor";
import { OpenFileWithDropdown } from "./OpenFileWithDropdown";

// Inner width above which a diff renders in two columns. Below this we fall
// back to a single column with del-then-add stacking.
const SIDE_BY_SIDE_MIN_PX = 1100;

type CellKind = "context" | "add" | "del" | "empty";

interface DiffCell {
  kind: CellKind;
  content: string;
  lineNo: number;
  tokens?: Token[];
}

interface DiffRow {
  left: DiffCell;
  right: DiffCell;
  hunkHeader?: string;
}

interface ContentLine {
  content: string;
  lineNo: number;
  tokens?: Token[];
}

const EMPTY_CELL: DiffCell = { kind: "empty", content: "", lineNo: 0 };

// Parse a unified-diff blob into rows that pair adjacent dels with adds so they
// sit on the same line in side-by-side mode. Hunk separators are kept as their
// own row via `hunkHeader`.
function parseDiffRows(diff: string): DiffRow[] {
  const out: DiffRow[] = [];
  let inHunk = false;
  let oldLineNo = 0;
  let newLineNo = 0;
  let dels: { content: string; ln: number }[] = [];
  let adds: { content: string; ln: number }[] = [];

  const flushPair = () => {
    const max = Math.max(dels.length, adds.length);
    for (let i = 0; i < max; i++) {
      out.push({
        left:
          i < dels.length
            ? { kind: "del", content: dels[i].content, lineNo: dels[i].ln }
            : EMPTY_CELL,
        right:
          i < adds.length
            ? { kind: "add", content: adds[i].content, lineNo: adds[i].ln }
            : EMPTY_CELL,
      });
    }
    dels = [];
    adds = [];
  };

  for (const line of diff.split("\n")) {
    if (line.startsWith("@@")) {
      flushPair();
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLineNo = Number.parseInt(m[1], 10);
        newLineNo = Number.parseInt(m[2], 10);
      }
      inHunk = true;
      out.push({ left: EMPTY_CELL, right: EMPTY_CELL, hunkHeader: line });
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      adds.push({ content: line.slice(1), ln: newLineNo });
      newLineNo++;
    } else if (line.startsWith("-")) {
      dels.push({ content: line.slice(1), ln: oldLineNo });
      oldLineNo++;
    } else if (line.startsWith(" ")) {
      flushPair();
      const content = line.slice(1);
      out.push({
        left: { kind: "context", content, lineNo: oldLineNo },
        right: { kind: "context", content, lineNo: newLineNo },
      });
      oldLineNo++;
      newLineNo++;
    }
  }
  flushPair();
  return out;
}

function buildContentLines(content: string): ContentLine[] {
  return content.split("\n").map((line, i) => ({
    content: line,
    lineNo: i + 1,
  }));
}

async function highlightDiffRows(rows: DiffRow[], lang: string): Promise<DiffRow[]> {
  if (!lang || !(await ensureLang(lang))) return rows;

  const leftIdx: number[] = [];
  const rightIdx: number[] = [];
  const leftLines: string[] = [];
  const rightLines: string[] = [];
  rows.forEach((row, i) => {
    if (row.hunkHeader) return;
    if (row.left.kind !== "empty") {
      leftIdx.push(i);
      leftLines.push(row.left.content);
    }
    if (row.right.kind !== "empty") {
      rightIdx.push(i);
      rightLines.push(row.right.content);
    }
  });

  const [leftTokens, rightTokens] = await Promise.all([
    tokenizeLines(leftLines.join("\n"), lang),
    tokenizeLines(rightLines.join("\n"), lang),
  ]);

  const next = rows.map((r) => ({
    ...r,
    left: { ...r.left },
    right: { ...r.right },
  }));
  leftTokens.forEach((tokens, i) => {
    if (i < leftIdx.length) next[leftIdx[i]].left.tokens = tokens;
  });
  rightTokens.forEach((tokens, i) => {
    if (i < rightIdx.length) next[rightIdx[i]].right.tokens = tokens;
  });
  return next;
}

async function highlightContent(
  lines: ContentLine[],
  lang: string,
): Promise<ContentLine[]> {
  if (!lang || !(await ensureLang(lang))) return lines;
  const tokens = await tokenizeLines(lines.map((l) => l.content).join("\n"), lang);
  return lines.map((line, i) => ({ ...line, tokens: tokens[i] }));
}

function useIsWide(threshold: number): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= threshold,
  );
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= threshold);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [threshold]);
  return wide;
}

interface FileViewerModalProps {
  open: boolean;
  absPath: string;
  line: number;
  col: number;
  projectRoot: string;
  onClose: () => void;
}

export function FileViewerModal({
  open,
  absPath,
  line,
  col,
  projectRoot,
  onClose,
}: FileViewerModalProps) {
  const [diffRows, setDiffRows] = useState<DiffRow[] | null>(null);
  const [contentLines, setContentLines] = useState<ContentLine[] | null>(null);
  const [rawContent, setRawContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const wide = useIsWide(SIDE_BY_SIDE_MIN_PX);

  // Reset edit state whenever the viewer is pointed at a different path.
  useEffect(() => {
    setEditing(false);
    setEditValue("");
    setSaving(false);
  }, [absPath]);

  useEffect(() => {
    if (!open || !absPath) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDiffRows(null);
    setContentLines(null);
    setRawContent("");

    (async () => {
      const lang = getLang(absPath);
      const rel = relTo(absPath, projectRoot);
      const [contentRes, diffRes] = await Promise.allSettled([
        ReadFile(absPath),
        projectRoot ? GitDiff(projectRoot, [rel]) : Promise.resolve(""),
      ]);
      if (cancelled) return;

      if (contentRes.status === "fulfilled") {
        setRawContent(contentRes.value);
      }

      const diffText =
        diffRes.status === "fulfilled" ? diffRes.value.trim() : "";
      if (diffText) {
        const parsed = parseDiffRows(diffText);
        if (parsed.length > 0) {
          const highlighted = await highlightDiffRows(parsed, lang);
          if (cancelled) return;
          setDiffRows(highlighted);
          setLoading(false);
          return;
        }
      }

      if (contentRes.status === "fulfilled") {
        const built = buildContentLines(contentRes.value);
        const highlighted = await highlightContent(built, lang);
        if (cancelled) return;
        setContentLines(highlighted);
      } else {
        setError(
          contentRes.reason instanceof Error
            ? contentRes.reason.message
            : String(contentRes.reason),
        );
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, absPath, projectRoot, reloadKey]);

  const hasDiff = diffRows !== null;
  const headerLabel = projectRoot ? relTo(absPath, projectRoot) : absPath;
  const canEdit = !loading && !error;
  const dirty = editing && editValue !== rawContent;

  const startEdit = () => {
    setEditValue(rawContent);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setEditValue("");
  };
  const saveEdit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await WriteFile(absPath, editValue);
      toast.success("Saved");
      setEditing(false);
      setEditValue("");
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex h-[90vh] w-[min(1480px,calc(100vw-32px))] flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-6 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
              <span className="truncate">{basename(absPath)}</span>
              {line > 0 && (
                <span className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono text-[11px] font-normal text-[var(--text-secondary)]">
                  :{line}
                  {col > 0 ? `:${col}` : ""}
                </span>
              )}
              {hasDiff && (
                <span className="rounded bg-[var(--accent-cyan)]/15 px-1.5 py-0.5 text-[11px] font-medium text-[var(--accent-cyan)]">
                  Modified
                </span>
              )}
            </div>
            <div className="truncate text-[12px] text-[var(--text-muted)]">
              {headerLabel}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveEdit()}
                  disabled={saving || !dirty}
                  className="rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-[13px] font-semibold text-[var(--bg-primary)] transition hover:opacity-90 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <>
                {canEdit && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    Edit
                  </button>
                )}
                <OpenFileWithDropdown absPath={absPath} line={line} col={col} />
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <XIcon />
                </button>
              </>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden bg-[var(--bg-primary)] font-mono text-[12px] leading-[1.55]">
          {editing ? (
            <MonacoEditor
              value={editValue}
              onChange={setEditValue}
              language={getLang(absPath)}
              modelUri={`lpm-file://${absPath}`}
              onSave={() => void saveEdit()}
            />
          ) : (
            <>
              {loading && (
                <div className="flex h-full items-center justify-center text-[13px] text-[var(--text-muted)]">
                  Loading…
                </div>
              )}
              {!loading && error && (
                <div className="flex h-full items-center justify-center px-8 text-center text-[13px] text-[var(--accent-red)]">
                  {error}
                </div>
              )}
              {!loading && !error && diffRows && (
                wide ? (
                  <SideBySideDiff rows={diffRows} highlightLine={line} />
                ) : (
                  <UnifiedDiff rows={diffRows} highlightLine={line} />
                )
              )}
              {!loading && !error && !diffRows && contentLines && (
                <ContentView lines={contentLines} highlightLine={line} />
              )}
              {!loading && !error && !diffRows && !contentLines && (
                <div className="flex h-full items-center justify-center text-[13px] text-[var(--text-muted)]">
                  Empty file
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

const cellBg: Record<CellKind, string> = {
  add: "bg-green-500/10",
  del: "bg-red-500/10",
  empty: "diff-empty-hatch",
  context: "",
};

function renderTokens(content: string, tokens: Token[] | undefined) {
  if (tokens && tokens.length > 0) {
    return tokens.map((t, i) => (
      <span key={i} style={t.color ? { color: t.color } : undefined}>
        {t.content}
      </span>
    ));
  }
  return content || " ";
}

// Git emits hunk headers like `@@ -1,98 +1,110 @@ functionName(...)`. The
// numeric range is noise to a reader; the optional trailing context (the name
// of the enclosing function) is the useful part.
const HUNK_PREFIX_RE = /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@\s?/;

function HunkBar({ header }: { header: string }) {
  const context = header.replace(HUNK_PREFIX_RE, "").trim();
  return (
    <div className="sticky left-0 flex h-5 items-center bg-[var(--bg-secondary)] text-[var(--text-muted)]">
      {context && (
        <span className="truncate px-3 text-[11px] italic">{context}</span>
      )}
    </div>
  );
}

function useScrollToTarget(
  ref: React.RefObject<HTMLDivElement | null>,
  signal: unknown,
) {
  useEffect(() => {
    if (!ref.current) return;
    const id = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(id);
  }, [ref, signal]);
}

function SideBySideDiff({
  rows,
  highlightLine,
}: {
  rows: DiffRow[];
  highlightLine: number;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  useScrollToTarget(targetRef, rows);
  // Single vertical scroll on the outer wrapper so both columns scroll
  // together. Each column keeps its own horizontal scroll for long lines.
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex">
        <DiffColumn rows={rows} side="left" highlightLine={highlightLine} targetRef={targetRef} withBorder />
        <DiffColumn rows={rows} side="right" highlightLine={highlightLine} targetRef={targetRef} />
      </div>
    </div>
  );
}

function DiffColumn({
  rows,
  side,
  highlightLine,
  targetRef,
  withBorder,
}: {
  rows: DiffRow[];
  side: "left" | "right";
  highlightLine: number;
  targetRef: React.RefObject<HTMLDivElement | null>;
  withBorder?: boolean;
}) {
  return (
    <div
      className={`min-w-0 flex-1 overflow-x-auto ${
        withBorder ? "border-r border-[var(--border)]" : ""
      }`}
    >
      {rows.map((row, i) => {
        if (row.hunkHeader) return <HunkBar key={i} header={row.hunkHeader} />;
        const cell = side === "left" ? row.left : row.right;
        const isTarget =
          side === "right" &&
          highlightLine > 0 &&
          cell.kind !== "empty" &&
          cell.lineNo === highlightLine;
        return (
          <div
            key={i}
            ref={isTarget ? targetRef : undefined}
            className={`flex w-max min-w-full ${cellBg[cell.kind]} ${
              isTarget ? "ring-1 ring-yellow-400/60 bg-yellow-500/15" : ""
            }`}
          >
            <span className="sticky left-0 z-[1] inline-flex w-12 shrink-0 select-none justify-end bg-inherit pr-2 text-[var(--text-muted)]/60">
              {cell.lineNo || ""}
            </span>
            <span className="whitespace-pre pr-6">
              {cell.kind === "empty" ? " " : renderTokens(cell.content, cell.tokens)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function UnifiedDiff({
  rows,
  highlightLine,
}: {
  rows: DiffRow[];
  highlightLine: number;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  useScrollToTarget(targetRef, rows);
  // Flatten paired rows: hunk → del → add → context, mirroring the diff order.
  const flat: { kind: CellKind | "hunk"; content: string; lineNo: number; tokens?: Token[] }[] = [];
  for (const row of rows) {
    if (row.hunkHeader) {
      flat.push({ kind: "hunk", content: row.hunkHeader, lineNo: 0 });
      continue;
    }
    if (row.left.kind === "del") {
      flat.push({ kind: "del", content: row.left.content, lineNo: row.left.lineNo, tokens: row.left.tokens });
    }
    if (row.right.kind === "add") {
      flat.push({ kind: "add", content: row.right.content, lineNo: row.right.lineNo, tokens: row.right.tokens });
    }
    if (row.left.kind === "context" && row.right.kind === "context") {
      flat.push({ kind: "context", content: row.right.content, lineNo: row.right.lineNo, tokens: row.right.tokens });
    }
  }
  return (
    <div className="h-full overflow-auto">
      <div className="w-max min-w-full">
        {flat.map((row, i) => {
          if (row.kind === "hunk") return <HunkBar key={i} header={row.content} />;
          const isTarget =
            highlightLine > 0 &&
            (row.kind === "add" || row.kind === "context") &&
            row.lineNo === highlightLine;
          return (
            <div
              key={i}
              ref={isTarget ? targetRef : undefined}
              className={`flex w-max min-w-full ${cellBg[row.kind as CellKind]} ${
                isTarget ? "ring-1 ring-yellow-400/60 bg-yellow-500/15" : ""
              }`}
            >
              <span className="sticky left-0 z-[1] inline-flex w-12 shrink-0 select-none justify-end bg-inherit pr-2 text-[var(--text-muted)]/60">
                {row.lineNo || ""}
              </span>
              <span className="w-4 shrink-0 select-none text-[var(--text-muted)]/60">
                {row.kind === "add" ? "+" : row.kind === "del" ? "-" : " "}
              </span>
              <span className="whitespace-pre pr-6">
                {renderTokens(row.content, row.tokens)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContentView({
  lines,
  highlightLine,
}: {
  lines: ContentLine[];
  highlightLine: number;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  useScrollToTarget(targetRef, lines);
  return (
    <div className="h-full overflow-auto">
      <div className="w-max min-w-full">
        {lines.map((row, i) => {
          const isTarget = highlightLine > 0 && row.lineNo === highlightLine;
          return (
            <div
              key={i}
              ref={isTarget ? targetRef : undefined}
              className={`flex w-max min-w-full ${
                isTarget ? "ring-1 ring-yellow-400/60 bg-yellow-500/15" : ""
              }`}
            >
              <span className="sticky left-0 z-[1] inline-flex w-12 shrink-0 select-none justify-end bg-inherit pr-2 text-[var(--text-muted)]/60">
                {row.lineNo}
              </span>
              <span className="whitespace-pre pr-6">
                {renderTokens(row.content, row.tokens)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
