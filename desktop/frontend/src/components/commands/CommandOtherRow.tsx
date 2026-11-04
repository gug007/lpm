import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { CommandScope, OtherSkill } from "../../lpmCommands";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { skillIndent } from "./commandFolders";
import { CommandFolderInput } from "./CommandFolderInput";
import { CommandOtherMoveItems } from "./CommandOtherMoveItems";
import { otherKey, otherSpotOf, type SkillRowActions } from "./commandsModel";

interface CommandOtherRowProps {
  scope: CommandScope;
  skill: OtherSkill;
  selected: boolean;
  actions: SkillRowActions;
  // How many folders it sits inside. The Other skills group counts as one.
  depth?: number;
}

// A skill not made in lpm, wherever its list shows it. Drag it, or right-click to
// move it or to turn it into an lpm skill.
export function CommandOtherRow({ scope, skill, selected, actions, depth = 1 }: CommandOtherRowProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [naming, setNaming] = useState(false);
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: otherKey(scope, skill.name),
    data: { other: skill, scope },
  });

  const pick = (action: () => void) => () => {
    setMenu(null);
    action();
  };

  if (naming) {
    return (
      <div className="py-0.5 pl-6 pr-1">
        <CommandFolderInput
          onDone={(folder) => {
            setNaming(false);
            if (folder) actions.onMoveOther(scope, skill.name, { folder, root: false });
          }}
        />
      </div>
    );
  }

  return (
    <>
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        onClick={() => actions.onSelectOther(scope, skill)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        aria-current={selected ? "true" : undefined}
        style={{ paddingLeft: skillIndent(depth) }}
        className={`flex w-full min-w-0 items-baseline gap-2 rounded-md py-1.5 pr-2 text-left transition-colors ${
          isDragging ? "opacity-40" : ""
        } ${selected ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"}`}
      >
        <span className="max-w-full shrink-0 truncate font-mono text-[12.5px] font-medium text-[var(--text-secondary)]">
          /{skill.name}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-muted)]">{skill.description}</span>
      </button>
      {menu && (
        <ContextMenuShell x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <CommandOtherMoveItems
            folders={actions.foldersOf(scope)}
            current={otherSpotOf(skill)}
            onMove={(spot) => pick(() => actions.onMoveOther(scope, skill.name, spot))()}
            onNewFolder={pick(() => setNaming(true))}
          />
          <ContextMenuItem
            label="Convert to lpm skill"
            description="You can edit it here"
            onClick={pick(() => actions.onConvert(scope, skill.name, true))}
          />
          <ContextMenuItem label="Open in Agent setup" onClick={pick(() => actions.onOpenInAgentSetup(skill))} />
        </ContextMenuShell>
      )}
    </>
  );
}
