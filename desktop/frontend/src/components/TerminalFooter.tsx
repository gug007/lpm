import { useGitStatus } from "../hooks/useGitStatus";
import { BranchSwitcher } from "./BranchSwitcher";

export function TerminalFooter({ projectPath }: { projectPath: string }) {
  const { status } = useGitStatus(projectPath);
  if (!status?.isGitRepo) return null;

  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-x border-t border-[var(--border)] bg-[var(--terminal-header)] px-3 py-1.5">
      <BranchSwitcher projectPath={projectPath} />
    </div>
  );
}
