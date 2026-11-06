import { Fragment, useLayoutEffect, useRef, type CSSProperties } from "react";
import { Settings2 } from "lucide-react";
import { createPortal } from "react-dom";
import { slashTag, type SlashCommand } from "../slashCommands";
import { COMMAND_COLOR } from "./composerEditor";

const GAP = 6;
const EDGE_MARGIN = 8;
const LIST_MAX_HEIGHT = 232;
const MAX_HEIGHT = 270;
const WIDTH = 520;

// lpm skills read in lpm's own accent; the agent's keep the terminal's blue.
const LPM_COMMAND_COLOR = "var(--accent-cyan)";

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
  // Caret rect the menu anchors to; the parent captures it at trigger time.
  anchorRect: DOMRect | null;
  onSelect: (cmd: SlashCommand) => void;
  onHoverIndex: (i: number) => void;
  // Opens the Commands tab; shown as the menu's last row when given.
  onManage?: () => void;
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
  const space = (placeAbove ? anchorRect.top : spaceBelow) - GAP - EDGE_MARGIN;
  const width = Math.min(WIDTH, window.innerWidth - 2 * EDGE_MARGIN);
  const left = Math.max(
    EDGE_MARGIN,
    Math.min(anchorRect.left, window.innerWidth - width - EDGE_MARGIN),
  );
  const style: CSSProperties = {
    position: "fixed",
    left,
    width,
    maxHeight: Math.min(MAX_HEIGHT, space),
    ...(placeAbove
      ? { bottom: window.innerHeight - anchorRect.top + GAP }
      : { top: anchorRect.bottom + GAP }),
  };
  const mostUsed = commands.filter((c) => c.mostUsed).length;
  const selected = commands[selectedIndex];
  const heading = (label: string) => (
    <div className="px-2.5 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
      {label}
    </div>
  );

  return createPortal(
    <div
      role="listbox"
      style={style}
      // Selecting a row must not blur the editor first, or the caret is lost.
      onMouseDown={(e) => e.preventDefault()}
      className="z-[9999] flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-[0_12px_32px_rgba(0,0,0,0.32)]"
    >
      <div
        ref={listRef}
        style={{ maxHeight: LIST_MAX_HEIGHT }}
        className="min-h-0 flex-1 overflow-y-auto p-1"
      >
        {commands.map((cmd, i) => {
          const on = i === selectedIndex;
          return (
            <Fragment key={`${cmd.source}:${cmd.scope ?? ""}:${cmd.name}`}>
              {i === 0 && mostUsed > 0 && heading("Most used")}
              {i === mostUsed && mostUsed > 0 && heading(`All ${commands.length - mostUsed}`)}
              <button
                type="button"
                role="option"
                data-index={i}
                aria-selected={on}
                onMouseEnter={() => onHoverIndex(i)}
                onClick={() => onSelect(cmd)}
                className={`grid w-full grid-cols-[196px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                  on ? "bg-[var(--bg-active)]" : ""
                }`}
              >
                <span
                  className="truncate font-mono text-[13px] font-medium"
                  style={{ color: cmd.source === "lpm" ? LPM_COMMAND_COLOR : COMMAND_COLOR }}
                >
                  /{cmd.name}
                </span>
                <span className="truncate text-[12px] text-[var(--text-secondary)]">
                  {cmd.description}
                </span>
                <span
                  className={`max-w-[110px] truncate text-[11px] ${
                    on ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  {slashTag(cmd)}
                </span>
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
          Manage skills
          <span className="ml-auto text-[10.5px]">
            {selected?.source === "lpm" ? "↵ insert · ⇥ edit prompt" : "↵ insert"}
          </span>
        </button>
      )}
    </div>,
    document.body,
  );
}
