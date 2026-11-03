import { Fragment, useLayoutEffect, useRef, type CSSProperties } from "react";
import { Settings2 } from "lucide-react";
import { createPortal } from "react-dom";
import type { SlashCommand } from "../slashCommands";
import { COMMAND_COLOR } from "./composerEditor";

const GAP = 6;
const EDGE_MARGIN = 8;
const MAX_HEIGHT = 280;
const WIDTH = 520;

const SOURCE_LABEL: Record<SlashCommand["source"], string> = {
  builtin: "built-in",
  project: "project",
  user: "user",
  lpm: "",
};

// lpm commands read in lpm's own accent; the agent's keep the terminal's blue.
const LPM_COMMAND_COLOR = "var(--accent-cyan)";

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
  // Caret rect the menu anchors to; the parent captures it at trigger time.
  anchorRect: DOMRect | null;
  onSelect: (cmd: SlashCommand) => void;
  onHoverIndex: (i: number) => void;
  // Names the agent's own group when lpm commands are listed above it.
  agentLabel?: string;
  // Opens the Commands tab; shown as the menu's last row when given.
  onManage?: () => void;
}

// The heading a row starts, if it starts a group: each lpm folder (and its
// list) gets one, and the agent's own commands get one below them.
function groupOf(cmd: SlashCommand, agentLabel: string): string {
  if (cmd.source !== "lpm") return agentLabel;
  const list = cmd.scope === "project" ? "this project" : "global";
  return `${cmd.folder ?? "No folder"} · ${list}`;
}

// Filterable popover of a CLI's slash commands, anchored to the composer caret.
// Presentational only — the composer owns all keyboard handling so the menu's
// Arrow/Enter/Tab/Escape stay in sync with the contentEditable selection.
export function SlashCommandMenu({
  commands,
  selectedIndex,
  anchorRect,
  onSelect,
  onHoverIndex,
  agentLabel = "Agent commands",
  onManage,
}: SlashCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the highlighted row visible as Arrow keys move the selection.
  useLayoutEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!anchorRect || commands.length === 0) return null;

  // Below the caret by default; flip above when the lower gap is too small.
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const placeAbove = spaceBelow < MAX_HEIGHT + GAP && anchorRect.top > spaceBelow;
  const width = Math.min(WIDTH, window.innerWidth - 2 * EDGE_MARGIN);
  const left = Math.max(
    EDGE_MARGIN,
    Math.min(anchorRect.left, window.innerWidth - width - EDGE_MARGIN),
  );
  const style: CSSProperties = {
    position: "fixed",
    left,
    width,
    maxHeight: MAX_HEIGHT,
    ...(placeAbove
      ? { bottom: window.innerHeight - anchorRect.top + GAP }
      : { top: anchorRect.bottom + GAP }),
  };
  const grouped = commands.some((c) => c.source === "lpm");

  return createPortal(
    <div
      role="listbox"
      style={style}
      // Selecting a row must not blur the editor first, or the caret is lost.
      onMouseDown={(e) => e.preventDefault()}
      className="z-[9999] flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-[0_12px_32px_rgba(0,0,0,0.32)]"
    >
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1">
        {commands.map((cmd, i) => {
          const group = grouped ? groupOf(cmd, agentLabel) : null;
          const startsGroup = group !== null && (i === 0 || groupOf(commands[i - 1], agentLabel) !== group);
          const lpm = cmd.source === "lpm";
          return (
            <Fragment key={`${cmd.source}:${cmd.scope ?? ""}:${cmd.name}`}>
              {startsGroup && (
                <div className="px-2.5 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  {group}
                </div>
              )}
              <button
                type="button"
                role="option"
                data-index={i}
                aria-selected={i === selectedIndex}
                onMouseEnter={() => onHoverIndex(i)}
                onClick={() => onSelect(cmd)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                  i === selectedIndex ? "bg-[var(--bg-active)]" : ""
                }`}
              >
                <span
                  className="shrink-0 font-mono text-[13px] font-medium"
                  style={{ color: lpm ? LPM_COMMAND_COLOR : COMMAND_COLOR }}
                >
                  /{cmd.name}
                </span>
                {cmd.argumentHint && (
                  <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)]">
                    {cmd.argumentHint}
                  </span>
                )}
                {cmd.description && (
                  <span className="flex-1 truncate text-[12px] text-[var(--text-secondary)]">
                    {cmd.description}
                  </span>
                )}
                {SOURCE_LABEL[cmd.source] && (
                  <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-[var(--text-muted)] opacity-60">
                    {SOURCE_LABEL[cmd.source]}
                  </span>
                )}
              </button>
            </Fragment>
          );
        })}
      </div>
      {onManage && (
        <button
          type="button"
          onClick={onManage}
          className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] px-3.5 py-2 text-left text-[11.5px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Settings2 size={13} strokeWidth={1.75} />
          Manage commands
          <span className="ml-auto text-[10.5px]">↵ run · ⇥ edit first</span>
        </button>
      )}
    </div>,
    document.body,
  );
}
