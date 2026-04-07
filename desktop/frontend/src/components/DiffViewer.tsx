interface DiffViewerProps {
  diff: string;
  loading?: boolean;
}

export function DiffViewer({ diff, loading }: DiffViewerProps) {
  if (loading) {
    return (
      <div className="px-3 py-3 text-[11px] text-[var(--text-muted)]">
        Loading diff...
      </div>
    );
  }

  if (!diff.trim()) {
    return (
      <div className="px-3 py-3 text-[11px] text-[var(--text-muted)]">
        No changes
      </div>
    );
  }

  const lines = diff.split("\n").filter(
    (l) =>
      !l.startsWith("diff --git") &&
      !l.startsWith("index ") &&
      !l.startsWith("new file mode") &&
      !l.startsWith("old mode") &&
      !l.startsWith("new mode") &&
      !l.startsWith("deleted file mode") &&
      !l.startsWith("similarity index") &&
      !l.startsWith("rename from") &&
      !l.startsWith("rename to") &&
      !l.startsWith("--- ") &&
      !l.startsWith("+++ "),
  );

  return (
    <pre className="max-h-[250px] overflow-auto border-t border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[11px] font-mono leading-[1.6]">
      {lines.map((line, i) => {
        let cls = "text-[var(--text-muted)]";
        if (line.startsWith("+")) {
          cls = "bg-green-500/10 text-green-400";
        } else if (line.startsWith("-")) {
          cls = "bg-red-500/10 text-red-400";
        } else if (line.startsWith("@@")) {
          cls = "text-[var(--accent-cyan)]";
        }
        return (
          <div key={i} className={cls}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}
