import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Copy, File, FileDiff, Folder, FolderGit2, GitBranch, ScrollText, SquareTerminal, type LucideIcon } from "lucide-react";
import type { MentionItem, MentionKind } from "../mentions";

const GAP = 6;
const EDGE_MARGIN = 8;
const MAX_HEIGHT = 280;
const WIDTH = 460;

const KIND_LABEL: Record<MentionKind, string> = {
  file: "file",
  dir: "folder",
  project: "project",
  duplicate: "duplicate",
  changed: "changed",
  branch: "branch",
  "service-log": "logs",
  "terminal-log": "logs",
};

const KIND_ICON: Record<MentionKind, LucideIcon> = {
  file: File,
  dir: Folder,
  project: FolderGit2,
  duplicate: Copy,
  changed: FileDiff,
  branch: GitBranch,
  "service-log": ScrollText,
  "terminal-log": SquareTerminal,
};

interface MentionMenuProps {
  items: MentionItem[];
  selectedIndex: number;
  // Caret rect the menu anchors to; the parent captures it at trigger time.
  anchorRect: DOMRect | null;
  onSelect: (item: MentionItem) => void;
  onHoverIndex: (i: number) => void;
}

// Filterable popover of "@" mention targets, anchored to the composer caret.
// Presentational only — the composer owns all keyboard handling so the menu's
// Arrow/Enter/Tab/Escape stay in sync with the contentEditable selection.
export function MentionMenu({
  items,
  selectedIndex,
  anchorRect,
  onSelect,
  onHoverIndex,
}: MentionMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the highlighted row visible as Arrow keys move the selection.
  useLayoutEffect(() => {
    const row = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!anchorRect || items.length === 0) return null;

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
      {items.map((item, i) => {
        const Icon = KIND_ICON[item.kind];
        return (
          <button
            key={`${item.kind}:${item.insert}:${i}`}
            type="button"
            role="option"
            aria-selected={i === selectedIndex}
            onMouseEnter={() => onHoverIndex(i)}
            onClick={() => onSelect(item)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
              i === selectedIndex ? "bg-[var(--bg-active)]" : ""
            }`}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-muted)]">
              <Icon size={14} strokeWidth={1.75} />
            </span>
            <span
              className={`truncate font-mono text-[13px] text-[var(--text-primary)] ${
                item.detail ? "shrink-0" : "min-w-0 flex-1"
              }`}
            >
              {item.label}
            </span>
            {item.detail && (
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-muted)]">
                {item.detail}
              </span>
            )}
            <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wider text-[var(--text-muted)] opacity-60">
              {KIND_LABEL[item.kind]}
            </span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
