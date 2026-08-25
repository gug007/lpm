// Diff and source rendering for the file viewer: unified-diff parsing,
// syntax-token attachment, and the three read-only surfaces the modal shows
// (side-by-side diff, unified diff, plain content).
import { useEffect, useRef } from "react";
import { ensureLang, tokenizeLines, type Token } from "../highlight";

// Inner width above which a diff renders in two columns. Below this we fall
// back to a single column with del-then-add stacking.
export const SIDE_BY_SIDE_MIN_PX = 1100;

type CellKind = "context" | "add" | "del" | "empty";

interface DiffCell {
  kind: CellKind;
  content: string;
  lineNo: number;
  tokens?: Token[];
}

export interface DiffRow {
  left: DiffCell;
  right: DiffCell;
  hunkHeader?: string;
}

export interface ContentLine {
  content: string;
  lineNo: number;
  tokens?: Token[];
}

const EMPTY_CELL: DiffCell = { kind: "empty", content: "", lineNo: 0 };

// Parse a unified-diff blob into rows that pair adjacent dels with adds so they
// sit on the same line in side-by-side mode. Hunk separators are kept as their
// own row via `hunkHeader`.
export function parseDiffRows(diff: string): DiffRow[] {
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

export function buildContentLines(content: string): ContentLine[] {
  return content.split("\n").map((line, i) => ({
    content: line,
    lineNo: i + 1,
  }));
}

export async function highlightDiffRows(rows: DiffRow[], lang: string): Promise<DiffRow[]> {
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

export async function highlightContent(
  lines: ContentLine[],
  lang: string,
): Promise<ContentLine[]> {
  if (!lang || !(await ensureLang(lang))) return lines;
  const tokens = await tokenizeLines(lines.map((l) => l.content).join("\n"), lang);
  return lines.map((line, i) => ({ ...line, tokens: tokens[i] }));
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

export function SideBySideDiff({
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
            <span className="sticky left-0 z-[1] inline-flex w-12 shrink-0 select-none justify-end bg-[var(--bg-primary)] pr-2 text-[var(--text-muted)]">
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

export function UnifiedDiff({
  rows,
  highlightLine,
}: {
  rows: DiffRow[];
  highlightLine: number;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  useScrollToTarget(targetRef, rows);
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
              <span className="sticky left-0 z-[1] inline-flex w-12 shrink-0 select-none justify-end bg-[var(--bg-primary)] pr-2 text-[var(--text-muted)]">
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

export function ContentView({
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
              <span className="sticky left-0 z-[1] inline-flex w-12 shrink-0 select-none justify-end bg-[var(--bg-primary)] pr-2 text-[var(--text-muted)]">
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
