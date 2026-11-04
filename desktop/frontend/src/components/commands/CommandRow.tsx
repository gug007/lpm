import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Check } from "lucide-react";
import { commandKey, type LpmCommand } from "../../lpmCommands";
import { skillIndent } from "./commandFolders";
import { CommandRowMenu } from "./CommandRowMenu";
import { HighlightedText } from "./HighlightedText";
import { MATCH_CLASS, promptSnippet, rowSummary } from "./skillSearch";
import { useSkillTree } from "./skillTreeContext";
import { runsLabel, runsTitle } from "./skillUsage";

interface CommandRowProps {
  command: LpmCommand;
  selected: boolean;
  // How many folders it sits inside.
  depth: number;
  // False when a same-named command elsewhere runs instead of this one.
  runs: boolean;
  onSelect: () => void;
}

// One skill in the tree. Click opens it, ⌘-click (Ctrl-click off macOS) or
// Shift-click picks it with others; drag it onto a folder or a list's heading
// to move it, and right-click for everything else.
export function CommandRow({ command, selected, depth, runs, onSelect }: CommandRowProps) {
  const tree = useSkillTree();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const key = commandKey(command);
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `command:${key}`,
    data: { command },
  });
  const picked = tree.picked.has(key);
  const snippet = tree.query ? promptSnippet(command, tree.query) : null;
  const usage = runsLabel(command, tree.now);
  const tone = picked
    ? "bg-[var(--accent-cyan)]/15"
    : selected
      ? "bg-[var(--bg-active)]"
      : tree.cursorKey === key
        ? "bg-[var(--bg-hover)] ring-1 ring-inset ring-[var(--accent-cyan)]/40"
        : "hover:bg-[var(--bg-hover)]";

  return (
    <>
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        data-skill-row={key}
        data-lpm-skill=""
        onClick={(e) => {
          if (!tree.pick(command, e)) onSelect();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        aria-current={selected ? "true" : undefined}
        aria-pressed={tree.picked.size > 0 ? picked : undefined}
        style={{ paddingLeft: skillIndent(depth) }}
        className={`flex w-full min-w-0 flex-col rounded-md py-1.5 pr-2 text-left transition-colors ${
          isDragging ? "opacity-40" : ""
        } ${tone}`}
      >
        <span className="flex w-full min-w-0 items-baseline gap-2">
          {picked && <Check size={11} className="shrink-0 self-center text-[var(--accent-cyan)]" />}
          <span
            className={`max-w-full shrink-0 truncate font-mono text-[12.5px] font-medium ${
              runs ? "text-[var(--accent-cyan)]" : "text-[var(--text-muted)] line-through"
            }`}
          >
            <HighlightedText text={`/${command.name}`} query={tree.query} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-muted)]">
            <HighlightedText text={rowSummary(command)} query={tree.query} />
          </span>
          {tree.unsavedKey === key && (
            <span
              title="Unsaved changes"
              aria-label="Unsaved changes"
              className="h-1.5 w-1.5 shrink-0 self-center rounded-full bg-[var(--accent-amber)]"
            />
          )}
          {usage && (
            <span title={runsTitle(command) ?? undefined} className="shrink-0 text-[10.5px] tabular-nums text-[var(--text-muted)]">
              {usage}
            </span>
          )}
        </span>
        {snippet && (
          <span className="w-full truncate pl-2 pt-0.5 text-[11px] text-[var(--text-muted)]">
            in prompt: {snippet.before}
            <mark className={MATCH_CLASS}>{snippet.match}</mark>
            {snippet.after}
          </span>
        )}
      </button>
      {menu && (
        <CommandRowMenu
          x={menu.x}
          y={menu.y}
          targets={picked && tree.pickedSkills.length > 1 ? tree.pickedSkills : [command]}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}
