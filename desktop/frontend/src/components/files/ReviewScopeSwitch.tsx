import { SegmentedControl } from "../ui/SegmentedControl";
import { branchCaption, type BranchChanges } from "./useBranchChanges";

export type ReviewScope = "uncommitted" | "branch";

interface ReviewScopeSwitchProps {
  scope: ReviewScope;
  // How many files are uncommitted, or null while that is unknown.
  uncommitted: number | null;
  branch: BranchChanges;
  onChange: (scope: ReviewScope) => void;
}

function label(text: string, count: number | null) {
  return (
    <span className="inline-flex items-center justify-center gap-1.5">
      {text}
      {count !== null && <span className="tabular-nums text-[var(--text-muted)]">{count}</span>}
    </span>
  );
}

// Under the rail's Changes view: the uncommitted files, or everything the
// branch's own commits changed since it left its base.
export function ReviewScopeSwitch({ scope, uncommitted, branch, onChange }: ReviewScopeSwitchProps) {
  const base = branch.status === "ready" ? branch.base : null;
  const none = branch.status === "ready" && !base;
  const caption =
    branch.status === "error"
      ? branch.message
      : none
        ? "No branch to compare with: this is the default branch and it has no upstream."
        : base && scope === "branch"
          ? `${branchCaption(base)} · read-only`
          : null;
  return (
    <div className="shrink-0 px-2 pt-1.5">
      <SegmentedControl<ReviewScope>
        value={scope}
        fullWidth
        variant="subtle"
        ariaLabel="Changes to review"
        onChange={onChange}
        options={[
          { value: "uncommitted", label: label("Uncommitted", uncommitted) },
          {
            value: "branch",
            label: label("Branch", branch.status === "ready" && base ? branch.files.length : null),
            disabled: none,
            tooltip: base ? `Everything the branch's ${branchCaption(base)} changed` : undefined,
          },
        ]}
      />
      {caption && <p className="px-1 pt-1 text-[11px] leading-snug text-[var(--text-muted)]">{caption}</p>}
    </div>
  );
}
