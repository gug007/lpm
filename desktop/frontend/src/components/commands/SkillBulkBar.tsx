import { useRef, useState } from "react";
import { ChevronDown, EyeOff, FolderInput, X } from "lucide-react";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { canKeepOutOfGit } from "./commandsModel";
import { SkillMoveItems } from "./SkillMoveItems";
import { useSkillTree } from "./skillTreeContext";

const BUTTON =
  "inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";

// What to do with the skills picked by ⌘-click or Shift-click, at the foot of
// the list while two or more are picked.
export function SkillBulkBar() {
  const { pickedSkills: picked, menu, clearPicks } = useSkillTree();
  const [moving, setMoving] = useState(false);
  const moveRef = useRef<HTMLButtonElement>(null);
  if (picked.length < 2) return null;
  const { lists } = menu;
  const toGlobal = lists.project !== null && picked.some((c) => c.scope === "project");
  const toProject = lists.project !== null && picked.some((c) => c.scope === "global");
  const gitable = picked.filter((c) => canKeepOutOfGit(c, lists));
  const allKept = gitable.length > 0 && gitable.every((c) => c.keptOutOfGit);

  return (
    <div
      role="toolbar"
      aria-label={`${picked.length} skills picked`}
      className="mx-2 mb-2 flex shrink-0 flex-wrap items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-1.5 shadow-lg"
    >
      <span className="px-1 text-[11.5px] font-semibold text-[var(--text-primary)]">{picked.length} picked</span>
      <button ref={moveRef} type="button" onClick={() => setMoving((v) => !v)} className={BUTTON}>
        <FolderInput size={12} />
        Move to
        <ChevronDown size={11} />
      </button>
      {toGlobal && (
        <button type="button" onClick={() => menu.copyTo(picked, "global")} className={BUTTON}>
          Copy to Global
        </button>
      )}
      {toProject && (
        <button type="button" onClick={() => menu.copyTo(picked, "project")} className={BUTTON}>
          Copy to this project
        </button>
      )}
      {gitable.length > 0 && (
        <button
          type="button"
          aria-pressed={allKept}
          onClick={() => menu.keepOut(gitable, !allKept)}
          className={`${BUTTON} ${allKept ? "text-[var(--accent-cyan)]" : ""}`}
        >
          <EyeOff size={12} />
          Keep out of Git
        </button>
      )}
      <button
        type="button"
        onClick={() => menu.remove(picked)}
        className={`${BUTTON} text-[var(--accent-red-text)] hover:text-[var(--accent-red-text)]`}
      >
        Delete
      </button>
      <button
        type="button"
        onClick={clearPicks}
        title="Clear (Esc)"
        aria-label="Clear the picked skills"
        className="ml-auto grid h-6 w-6 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <X size={13} />
      </button>
      {moving && moveRef.current && (
        <ContextMenuShell anchor={moveRef.current} trigger={moveRef.current} side="top" onClose={() => setMoving(false)}>
          <SkillMoveItems
            targets={picked}
            lists={lists}
            onMove={(to) => {
              setMoving(false);
              menu.move(picked, to);
            }}
          />
        </ContextMenuShell>
      )}
    </div>
  );
}
