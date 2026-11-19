import { branchCaption, type BranchChanges } from "./useBranchChanges";

// The Branch scope with nothing to show: still looking, nothing to compare
// with, or a branch with no commits of its own yet.
export function FilesBranchEmpty({ branch }: { branch: BranchChanges }) {
  const text =
    branch.status === "loading"
      ? "Looking at the branch…"
      : branch.status === "error"
        ? branch.message
        : !branch.base
          ? "This is the default branch and it has no upstream, so there is nothing to compare it with."
          : branch.base.commits === 0
            ? `No commits of its own yet: it is where it left ${branch.base.name}.`
            : `${branchCaption(branch.base)}, and they change no files.`;
  return (
    <div className="flex h-full items-center justify-center px-8 text-center text-[13px] text-[var(--text-muted)]">
      {text}
    </div>
  );
}
