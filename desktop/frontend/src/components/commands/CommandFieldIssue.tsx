import type { DraftIssue } from "./commandsModel";

interface CommandFieldIssueProps {
  id: string;
  issue: DraftIssue;
  onFix?: (name: string) => void;
}

// What's wrong with a field, said under it, with the name that would do when
// lpm can offer one.
export function CommandFieldIssue({ id, issue, onFix }: CommandFieldIssueProps) {
  const fix = onFix && issue.fix;
  return (
    <p id={id} role="alert" className="text-[11.5px] leading-snug text-[var(--accent-amber-text)]">
      {issue.message}
      {fix && (
        <>
          {" "}
          <button
            type="button"
            onClick={() => onFix(fix)}
            className="font-medium underline underline-offset-2 hover:brightness-110"
          >
            Use <span className="font-mono">{fix}</span>
          </button>
        </>
      )}
    </p>
  );
}
