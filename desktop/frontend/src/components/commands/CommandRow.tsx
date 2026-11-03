import { useDraggable } from "@dnd-kit/core";
import { commandKey, type LpmCommand } from "../../lpmCommands";

interface CommandRowProps {
  command: LpmCommand;
  selected: boolean;
  // Shown on every row of All commands, where folders mix.
  showPlace: boolean;
  // False when a same-named command elsewhere runs instead of this one.
  runs: boolean;
  onSelect: () => void;
}

// One command in the middle column; drag it onto a folder to move it.
export function CommandRow({ command, selected, showPlace, runs, onSelect }: CommandRowProps) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `command:${commandKey(command)}`,
    data: { command },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={`flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors ${
        isDragging ? "opacity-40" : ""
      } ${selected ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`max-w-full shrink-0 truncate font-mono text-[12.5px] font-medium ${
            runs ? "text-[var(--accent-cyan)]" : "text-[var(--text-muted)] line-through"
          }`}
        >
          /{command.name}
        </span>
        {command.argumentHint && !showPlace && (
          <span className="min-w-0 truncate font-mono text-[10.5px] text-[var(--text-muted)]">{command.argumentHint}</span>
        )}
        {showPlace && (
          <span className="ml-auto min-w-0 truncate text-[10.5px] text-[var(--text-muted)]">
            {command.folder ? `${command.folder} · ` : ""}
            {command.scope === "project" ? "project" : "global"}
          </span>
        )}
      </span>
      <span className="truncate text-[11.5px] text-[var(--text-muted)]">
        {command.description || command.body.split("\n")[0]}
      </span>
    </button>
  );
}
