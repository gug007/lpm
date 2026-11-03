import { useRef, useState } from "react";
import { Download } from "lucide-react";
import type { CommandScope } from "../../lpmCommands";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";

interface CommandImportButtonProps {
  hasProject: boolean;
  onImport: (scope: CommandScope) => void;
}

// Copies the custom commands the agent CLIs already have into an Imported
// folder: the user's own into the global list, the project's into its list.
export function CommandImportButton({ hasProject, onImport }: CommandImportButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const pick = (scope: CommandScope) => {
    setOpen(false);
    onImport(scope);
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Download size={12} />
        Import
      </button>
      {open && ref.current && (
        <ContextMenuShell anchor={ref.current} trigger={ref.current} align="end" onClose={() => setOpen(false)}>
          <ContextMenuItem
            label="Into Global"
            description="From ~/.claude/commands and ~/.codex/prompts"
            onClick={() => pick("global")}
          />
          {hasProject && (
            <ContextMenuItem
              label="Into this project"
              description="From the project's .claude/commands"
              onClick={() => pick("project")}
            />
          )}
        </ContextMenuShell>
      )}
    </>
  );
}
