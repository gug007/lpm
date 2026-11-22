import { useState } from "react";
import { outputLineCount, outputPreview } from "../commitHook";

/** What a commit hook printed, folded to the lines that report something,
 *  with the whole of it a click away. */
export function CommitHookOutput({ output }: { output: string }) {
  const [open, setOpen] = useState(false);
  if (!output.trim()) return null;
  const total = outputLineCount(output);
  const preview = outputPreview(output);
  const folds = preview.length < total;
  return (
    <div className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]">
      <pre
        className={`overflow-auto whitespace-pre px-2.5 py-2 font-mono text-[11px] leading-[1.55] text-[var(--text-secondary)] ${open ? "max-h-60" : "max-h-32"}`}
      >
        {folds && !open ? preview.join("\n") : output}
      </pre>
      {folds && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full border-t border-[var(--border)] px-2.5 py-1 text-left text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          {open ? "Show less" : `Show all output (${total} lines)`}
        </button>
      )}
    </div>
  );
}
