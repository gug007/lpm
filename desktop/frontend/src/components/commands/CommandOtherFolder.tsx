import { useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, FolderLock } from "lucide-react";
import type { CommandScope, OtherSkill } from "../../lpmCommands";
import { CommandOtherRow } from "./CommandOtherRow";
import { folderKey, otherKey, type SkillRowActions } from "./commandsModel";

interface CommandOtherFolderProps {
  scope: CommandScope;
  skills: OtherSkill[];
  open: boolean;
  selectedKey: string | null;
  actions: SkillRowActions;
  onToggle: () => void;
}

// The skills in a list's places that weren't made in lpm and aren't in a folder:
// a group of its own at the end of the list, closed until asked for. Dropping one
// here takes it back out of its folder.
export function CommandOtherFolder({ scope, skills, open, selectedKey, actions, onToggle }: CommandOtherFolderProps) {
  const rootKey = folderKey(scope, null);
  const { setNodeRef, isOver } = useDroppable({ id: `others:${rootKey}`, data: { folderKey: rootKey } });
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-px rounded-md border transition-colors ${
        isOver ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10" : "border-transparent"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Chevron size={12} className="shrink-0 text-[var(--text-muted)]" />
        <FolderLock size={13} className="shrink-0 text-[var(--text-muted)]" />
        <span className="min-w-0 flex-1 truncate">Other skills</span>
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">{skills.length}</span>
      </button>
      {open &&
        skills.map((skill) => (
          <CommandOtherRow
            key={skill.name}
            scope={scope}
            skill={skill}
            selected={selectedKey === otherKey(scope, skill.name)}
            actions={actions}
          />
        ))}
    </div>
  );
}
