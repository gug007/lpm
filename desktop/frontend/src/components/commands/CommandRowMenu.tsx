import { Check, Copy, CopyPlus, EyeOff, FileText, FolderGit2, FolderInput, FolderSearch, Globe, Lock, Trash2 } from "lucide-react";
import type { CommandScope, LpmCommand } from "../../lpmCommands";
import { revealLabel } from "../../machineWords";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSeparator } from "../ui/ContextMenuSeparator";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { ContextMenuSubmenu } from "../ui/ContextMenuSubmenu";
import { canKeepOutOfGit } from "./commandsModel";
import { SkillMoveItems } from "./SkillMoveItems";
import { useSkillTree } from "./skillTreeContext";

interface CommandRowMenuProps {
  x: number;
  y: number;
  // The skill right-clicked, or every picked skill when it's one of them.
  targets: LpmCommand[];
  onClose: () => void;
}

const ICON = 12;

// The right-click menu of a skill made in lpm, or of several picked together.
export function CommandRowMenu({ x, y, targets, onClose }: CommandRowMenuProps) {
  const { menu } = useSkillTree();
  const { lists } = menu;
  const run = (action: () => void) => () => {
    onClose();
    action();
  };
  const one = targets.length === 1 ? targets[0] : null;
  const copyScopes: CommandScope[] = lists.project
    ? (["global", "project"] as const).filter((scope) => targets.some((c) => c.scope !== scope))
    : [];
  const gitable = targets.filter((c) => canKeepOutOfGit(c, lists));
  const allKept = gitable.length > 0 && gitable.every((c) => c.keptOutOfGit);

  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      {one ? (
        <>
          <ContextMenuItem
            icon={<Copy size={ICON} />}
            label={`Copy /${one.name}`}
            onClick={run(() => menu.copyName(one))}
          />
          <ContextMenuItem icon={<CopyPlus size={ICON} />} label="Duplicate" onClick={run(() => menu.duplicate(one))} />
        </>
      ) : (
        <div className="px-3 pb-1 pt-1.5 text-[11px] font-medium text-[var(--text-primary)]">
          {targets.length} skills
        </div>
      )}
      <ContextMenuSeparator />
      <ContextMenuSubmenu label="Move to" icon={<FolderInput size={ICON} />}>
        <SkillMoveItems targets={targets} lists={lists} onMove={(to) => run(() => menu.move(targets, to))()} />
      </ContextMenuSubmenu>
      {copyScopes.map((scope) => (
        <ContextMenuItem
          key={scope}
          icon={scope === "global" ? <Globe size={ICON} /> : <FolderGit2 size={ICON} />}
          label={scope === "global" ? "Copy to Global" : "Copy to this project"}
          onClick={run(() => menu.copyTo(targets, scope))}
        />
      ))}
      {gitable.length > 0 && (
        <ContextMenuItem
          icon={<EyeOff size={ICON} />}
          label="Keep out of Git"
          trailing={allKept ? <Check size={11} /> : undefined}
          onClick={run(() => menu.keepOut(gitable, !allKept))}
        />
      )}
      {one && menu.canReveal(one) && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem icon={<FolderSearch size={ICON} />} label={revealLabel()} onClick={run(() => menu.reveal(one))} />
          <ContextMenuItem icon={<FileText size={ICON} />} label="Open SKILL.md" onClick={run(() => menu.open(one))} />
        </>
      )}
      {one && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            icon={<Lock size={ICON} />}
            label="Convert to other skill"
            description="It becomes read-only here"
            onClick={run(() => menu.convert(one))}
          />
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        icon={<Trash2 size={ICON} />}
        label={one ? "Delete…" : `Delete ${targets.length} skills…`}
        destructive
        onClick={run(() => menu.remove(targets))}
      />
    </ContextMenuShell>
  );
}
