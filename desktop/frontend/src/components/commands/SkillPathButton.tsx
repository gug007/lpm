import { useRef, useState } from "react";
import { ChevronDown, Copy, FileText, FolderSearch } from "lucide-react";
import type { CommandScope } from "../../lpmCommands";
import { revealLabel } from "../../machineWords";
import { stripMarker } from "../../peer/markers";
import { copyAbsolutePath, revealInFinder } from "../files/fileActions";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { canOpenSkillFile, canRevealSkillFile, type SkillFiles } from "./skillFile";

interface SkillPathButtonProps {
  // How the footer names the file: from the project's folder, or from ~.
  label: string;
  // The file itself, or null while the name on show isn't on disk yet: a new
  // skill, or one being renamed or moved to the other list.
  path: string | null;
  scope: CommandScope;
  files: SkillFiles;
}

const ICON = 12;
const TEXT = "font-mono text-[11px] text-[var(--text-muted)]";

// A skill's footer: where its file is, and what can be done with it from here.
export function SkillPathButton({ label, path, scope, files }: SkillPathButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  if (!path) return <span className={`min-w-0 flex-1 truncate ${TEXT}`}>{label}</span>;

  const reach = files.reachOf(path, scope);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="flex min-w-0 flex-1">
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={stripMarker(path)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`-ml-1.5 flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${TEXT} ${
          open ? "bg-[var(--bg-hover)]" : ""
        }`}
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown size={11} className="shrink-0" />
      </button>
      {open && ref.current && (
        <ContextMenuShell anchor={ref.current} trigger={ref.current} side="top" onClose={() => setOpen(false)}>
          {canOpenSkillFile(reach) && (
            <ContextMenuItem icon={<FileText size={ICON} />} label="Open SKILL.md" onClick={run(() => files.open(path))} />
          )}
          {canRevealSkillFile(reach) && (
            <ContextMenuItem
              icon={<FolderSearch size={ICON} />}
              label={revealLabel()}
              onClick={run(() => void revealInFinder(path))}
            />
          )}
          <ContextMenuItem
            icon={<Copy size={ICON} />}
            label="Copy path"
            onClick={run(() => void copyAbsolutePath(path))}
          />
        </ContextMenuShell>
      )}
    </div>
  );
}
