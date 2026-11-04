import { useDraggable } from "@dnd-kit/core";
import { commandKey, type LpmCommand } from "../../lpmCommands";

interface CommandRowProps {
  command: LpmCommand;
  selected: boolean;
  // Inside a folder, so indented under it.
  nested: boolean;
  // False when a same-named command elsewhere runs instead of this one.
  runs: boolean;
  onSelect: () => void;
}

// One command in the tree; drag it onto a folder or a list's heading to move it.
export function CommandRow({ command, selected, nested, runs, onSelect }: CommandRowProps) {
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
      className={`flex w-full min-w-0 items-baseline gap-2 rounded-md py-1.5 pr-2 text-left transition-colors ${
        nested ? "pl-7" : "pl-2"
      } ${isDragging ? "opacity-40" : ""} ${selected ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"}`}
    >
      <span
        className={`max-w-full shrink-0 truncate font-mono text-[12.5px] font-medium ${
          runs ? "text-[var(--accent-cyan)]" : "text-[var(--text-muted)] line-through"
        }`}
      >
        /{command.name}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-muted)]">
        {command.description || command.body.split("\n")[0]}
      </span>
    </button>
  );
}
