import { Tooltip } from "./ui/Tooltip";

interface CloseIssueToggleProps {
  issue: number;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}

// On a new pull request whose branch was started from an issue.
export function CloseIssueToggle({ issue, checked, disabled, onToggle }: CloseIssueToggleProps) {
  return (
    <Tooltip content={`Adds “Closes #${issue}” to the description`} side="top" align="start">
      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={disabled}
          className="h-3 w-3 accent-[var(--accent-blue)]"
        />
        Close #{issue} on merge
      </label>
    </Tooltip>
  );
}
