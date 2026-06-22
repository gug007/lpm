import { useLayoutEffect, useRef, type CSSProperties } from "react";
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
};

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
  // Caret rect the menu anchors to; the parent captures it at trigger time.
  anchorRect: DOMRect | null;
  onSelect: (cmd: SlashCommand) => void;
  onHoverIndex: (i: number) => void;
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
}: SlashCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the highlighted row visible as Arrow keys move the selection.
  useLayoutEffect(() => {
    const row = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
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

  return createPortal(
    <div
      ref={listRef}
      role="listbox"
      style={style}
      // Selecting a row must not blur the editor first, or the caret is lost.
      onMouseDown={(e) => e.preventDefault()}
      className="z-[9999] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.32)]"
    >
      {commands.map((cmd, i) => (
        <button
          key={`${cmd.source}:${cmd.name}`}
          type="button"
          role="option"
          aria-selected={i === selectedIndex}
          onMouseEnter={() => onHoverIndex(i)}
          onClick={() => onSelect(cmd)}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
            i === selectedIndex ? "bg-[var(--bg-active)]" : ""
          }`}
        >
          <span
            className="shrink-0 font-mono text-[13px] font-medium"
            style={{ color: COMMAND_COLOR }}
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
          <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-[var(--text-muted)] opacity-60">
            {SOURCE_LABEL[cmd.source]}
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
