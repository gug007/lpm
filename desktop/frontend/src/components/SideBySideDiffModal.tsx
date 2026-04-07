import { Fragment, useEffect, useState, type ReactNode } from "react";
import { createHighlighter, type Highlighter, type BundledLanguage } from "shiki";
import { Modal } from "./ui/Modal";
import { XIcon } from "./icons";
import { GitDiff } from "../../wailsjs/go/main/App";

interface Token {
  content: string;
  color?: string;
}

interface DiffLine {
  type: "context" | "add" | "del" | "empty";
  content: string;
  lineNo?: number;
  tokens?: Token[];
}

interface DiffRow {
  left: DiffLine;
  right: DiffLine;
}

interface FileDiff {
  path: string;
  rows: DiffRow[];
}

/* ── Diff parser ───────────────────────────────────────────────── */

function parseSideBySide(raw: string): FileDiff[] {
  const files: FileDiff[] = [];
  const chunks = raw.split(/(?=^diff --git )/m).filter(Boolean);

  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    const match = lines[0].match(/diff --git a\/.*? b\/(.*)/);
    const path = match?.[1] ?? "";

    const rows: DiffRow[] = [];
    let leftNo = 0,
      rightNo = 0;
    let dels: string[] = [],
      adds: string[] = [];

    const flush = () => {
      const max = Math.max(dels.length, adds.length);
      for (let j = 0; j < max; j++) {
        rows.push({
          left:
            j < dels.length
              ? { type: "del", content: dels[j].slice(1), lineNo: ++leftNo }
              : { type: "empty", content: "" },
          right:
            j < adds.length
              ? { type: "add", content: adds[j].slice(1), lineNo: ++rightNo }
              : { type: "empty", content: "" },
        });
      }
      dels = [];
      adds = [];
    };

    for (const line of lines) {
      if (
        line.startsWith("diff --git") ||
        line.startsWith("index ") ||
        line.startsWith("new file") ||
        line.startsWith("deleted file") ||
        line.startsWith("old mode") ||
        line.startsWith("new mode") ||
        line.startsWith("similarity") ||
        line.startsWith("rename from") ||
        line.startsWith("rename to") ||
        line.startsWith("--- ") ||
        line.startsWith("+++ ")
      )
        continue;

      if (line.startsWith("@@")) {
        flush();
        const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (m) {
          leftNo = parseInt(m[1]) - 1;
          rightNo = parseInt(m[2]) - 1;
        }
        continue;
      }

      if (line.startsWith("-")) {
        dels.push(line);
      } else if (line.startsWith("+")) {
        adds.push(line);
      } else {
        flush();
        const content = line.startsWith(" ") ? line.slice(1) : line;
        rows.push({
          left: { type: "context", content, lineNo: ++leftNo },
          right: { type: "context", content, lineNo: ++rightNo },
        });
      }
    }
    flush();

    if (path) files.push({ path, rows });
  }

  return files;
}

/* ── Syntax highlighting ───────────────────────────────────────── */

const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  go: "go",
  py: "python",
  rs: "rust",
  rb: "ruby",
  css: "css",
  scss: "scss",
  html: "html",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  mdx: "mdx",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  toml: "toml",
  xml: "xml",
  vue: "vue",
  svelte: "svelte",
  graphql: "graphql",
  dockerfile: "dockerfile",
  makefile: "makefile",
};

function getLang(path: string): string {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile") return "makefile";
  const ext = name.split(".").pop() ?? "";
  return EXT_LANG[ext] ?? "";
}

let hlPromise: Promise<Highlighter> | null = null;
function getHL(): Promise<Highlighter> {
  if (!hlPromise) {
    hlPromise = createHighlighter({ themes: ["github-dark"], langs: [] });
  }
  return hlPromise;
}

async function highlightDiffs(diffs: FileDiff[]): Promise<FileDiff[]> {
  const hl = await getHL();

  return Promise.all(
    diffs.map(async (file) => {
      const lang = getLang(file.path);
      if (!lang) return file;

      if (!hl.getLoadedLanguages().includes(lang)) {
        try {
          await hl.loadLanguage(lang as Parameters<typeof hl.loadLanguage>[0]);
        } catch {
          return file;
        }
      }

      // Collect code lines per side with row index mapping
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

      const opts = { lang: lang as BundledLanguage, theme: "github-dark" as const };
      const leftTokens = hl.codeToTokens(leftLines.join("\n"), opts).tokens;
      const rightTokens = hl.codeToTokens(rightLines.join("\n"), opts).tokens;

      // Map tokens back to rows
      const newRows: DiffRow[] = file.rows.map((r) => ({
        left: { ...r.left },
        right: { ...r.right },
      }));

      leftTokens.forEach((lineTokens, i) => {
        if (i < leftIdx.length) {
          newRows[leftIdx[i]].left.tokens = lineTokens.map((t) => ({
            content: t.content,
            color: t.color,
          }));
        }
      });

      rightTokens.forEach((lineTokens, i) => {
        if (i < rightIdx.length) {
          newRows[rightIdx[i]].right.tokens = lineTokens.map((t) => ({
            content: t.content,
            color: t.color,
          }));
        }
      });

      return { ...file, rows: newRows };
    }),
  );
}

/* ── Rendering helpers ─────────────────────────────────────────── */

const rowBg = (type: DiffLine["type"]) => {
  switch (type) {
    case "add":
      return "bg-green-500/10";
    case "del":
      return "bg-red-500/10";
    case "empty":
      return "bg-[var(--bg-secondary)]";
    default:
      return "";
  }
};

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

/* ── Component ─────────────────────────────────────────────────── */

interface Props {
  open: boolean;
  onClose: () => void;
  projectPath: string;
  files: string[];
}

export function SideBySideDiffModal({
  open,
  onClose,
  projectPath,
  files,
}: Props) {
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || files.length === 0) return;
    let cancelled = false;
    setLoading(true);
    GitDiff(projectPath, files)
      .then(async (raw) => {
        if (cancelled) return;
        const parsed = parseSideBySide(raw);
        setFileDiffs(parsed);
        setLoading(false);
        // Highlight in background, update when ready
        const highlighted = await highlightDiffs(parsed);
        if (!cancelled) setFileDiffs(highlighted);
      })
      .catch(() => {
        if (!cancelled) {
          setFileDiffs([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectPath, files]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndexClassName="z-[110]"
      contentClassName="w-[90vw] max-w-[1200px] h-[80vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Review Changes
          <span className="ml-2 text-[11px] font-normal text-[var(--text-muted)]">
            {fileDiffs.length} file{fileDiffs.length !== 1 ? "s" : ""}
          </span>
        </h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <XIcon />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
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
          fileDiffs.map((file) => (
            <div
              key={file.path}
              className="border-b border-[var(--border)] last:border-b-0"
            >
              <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-[11px] font-medium text-[var(--text-primary)]">
                {file.path}
              </div>
              <div className="grid grid-cols-2 font-mono text-[11px] leading-[1.6]">
                {file.rows.map((row, i) => (
                  <Fragment key={i}>
                    <div
                      className={`flex min-w-0 overflow-x-auto border-r border-[var(--border)] ${rowBg(row.left.type)}`}
                    >
                      <span className="w-10 shrink-0 select-none pr-2 text-right text-[10px] text-[var(--text-muted)]/40">
                        {row.left.lineNo ?? ""}
                      </span>
                      <span className="flex-1 whitespace-pre">
                        {renderContent(row.left)}
                      </span>
                    </div>
                    <div
                      className={`flex min-w-0 overflow-x-auto ${rowBg(row.right.type)}`}
                    >
                      <span className="w-10 shrink-0 select-none pr-2 text-right text-[10px] text-[var(--text-muted)]/40">
                        {row.right.lineNo ?? ""}
                      </span>
                      <span className="flex-1 whitespace-pre">
                        {renderContent(row.right)}
                      </span>
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          ))}
      </div>
    </Modal>
  );
}
