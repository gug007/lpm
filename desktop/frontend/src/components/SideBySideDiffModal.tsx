import { Fragment, useEffect, useState } from "react";
import { Modal } from "./ui/Modal";
import { XIcon } from "./icons";
import { GitDiff } from "../../wailsjs/go/main/App";

interface DiffLine {
  type: "context" | "add" | "del" | "empty";
  content: string;
  lineNo?: number;
}

interface DiffRow {
  left: DiffLine;
  right: DiffLine;
}

interface FileDiff {
  path: string;
  rows: DiffRow[];
}

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

const lineColor = (type: DiffLine["type"]) => {
  switch (type) {
    case "add":
      return "text-green-400";
    case "del":
      return "text-red-400";
    default:
      return "text-[var(--text-primary)]";
  }
};

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
      .then((raw) => {
        if (!cancelled) setFileDiffs(parseSideBySide(raw));
      })
      .catch(() => {
        if (!cancelled) setFileDiffs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
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
                      <span
                        className={`flex-1 whitespace-pre ${lineColor(row.left.type)}`}
                      >
                        {row.left.content || " "}
                      </span>
                    </div>
                    <div
                      className={`flex min-w-0 overflow-x-auto ${rowBg(row.right.type)}`}
                    >
                      <span className="w-10 shrink-0 select-none pr-2 text-right text-[10px] text-[var(--text-muted)]/40">
                        {row.right.lineNo ?? ""}
                      </span>
                      <span
                        className={`flex-1 whitespace-pre ${lineColor(row.right.type)}`}
                      >
                        {row.right.content || " "}
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
