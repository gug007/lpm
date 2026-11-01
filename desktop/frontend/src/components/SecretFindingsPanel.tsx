import { findingKey, findingPlace, type SecretFinding } from "../secretScan";
import { AlertCircleIcon, XIcon } from "./icons";

interface SecretFindingsPanelProps {
  findings: SecretFinding[];
  busy: boolean;
  onLeaveOut: (path: string) => void;
  onIgnore: (finding: SecretFinding) => void;
  onCommitAnyway: () => void;
  onDismiss: () => void;
}

const ACTION_CLASS =
  "shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40";

/** What the secret check found in the commit, each with a way past it. */
export function SecretFindingsPanel({
  findings,
  busy,
  onLeaveOut,
  onIgnore,
  onCommitAnyway,
  onDismiss,
}: SecretFindingsPanelProps) {
  if (findings.length === 0) return null;
  const count = findings.length;
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10 p-3"
    >
      <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--accent-amber-text)]">
        <span className="flex shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">
          <AlertCircleIcon />
        </span>
        {count === 1 ? "This commit may contain a secret" : `This commit may contain ${count} secrets`}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Back to the commit"
          className="ml-auto rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] [&>svg]:h-3 [&>svg]:w-3"
        >
          <XIcon />
        </button>
      </div>
      <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {findings.map((f) => (
          <li key={findingKey(f)} className="flex items-center gap-2 text-[12px]">
            <span className="min-w-0 flex-1 truncate">
              <span className="text-[var(--text-primary)]">{f.rule}</span>
              <span className="ml-2 font-mono text-[11px] text-[var(--text-muted)]" title={findingPlace(f)}>
                {findingPlace(f)}
              </span>
              {f.masked && (
                <span className="ml-2 font-mono text-[11px] text-[var(--text-secondary)]">{f.masked}</span>
              )}
            </span>
            <button type="button" disabled={busy} onClick={() => onLeaveOut(f.path)} className={ACTION_CLASS}>
              Leave file out
            </button>
            <button type="button" disabled={busy} onClick={() => onIgnore(f)} className={ACTION_CLASS}>
              {f.line > 0 ? "Ignore line" : "Ignore"}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={onCommitAnyway}
          className="rounded-md px-2.5 py-1 text-[12px] font-medium text-[var(--accent-amber-text)] transition-colors hover:bg-[var(--accent-amber)]/15 disabled:opacity-40"
        >
          Commit anyway
        </button>
      </div>
    </div>
  );
}
