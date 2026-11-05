import { SquareSlash } from "lucide-react";
import type { CommandScope } from "../../lpmCommands";
import { CommandImportButton } from "./CommandImportButton";
import { SkillVideosButton } from "./SkillVideosButton";

interface CommandsHeaderProps {
  hasProject: boolean;
  onImport: (scope: CommandScope) => void;
}

// The Skills tab's title row: what a skill is for, its video guides, and Import.
export function CommandsHeader({ hasProject, onImport }: CommandsHeaderProps) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-2.5">
      <SquareSlash size={15} className="text-[var(--accent-cyan)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[var(--text-primary)]">Skills</p>
        <p className="truncate text-[11.5px] text-[var(--text-muted)]">
          Type <span className="font-mono text-[var(--accent-cyan)]">/name</span> in an agent's input to run one.
        </p>
      </div>
      <SkillVideosButton />
      <CommandImportButton hasProject={hasProject} onImport={onImport} />
    </div>
  );
}
