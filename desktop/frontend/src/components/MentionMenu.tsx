import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Brain, Copy, File, FileDiff, Folder, FolderGit2, GitBranch, Plus, ScrollText, SquareTerminal, type LucideIcon } from "lucide-react";
import type { MentionItem, MentionKind } from "../mentions";

const GAP = 6;
const EDGE_MARGIN = 8;
const MAX_HEIGHT = 280;
const WIDTH = 460;
const SUBMENU_WIDTH = 300;

const KIND_LABEL: Record<MentionKind, string> = {
  file: "file",
  dir: "folder",
  project: "project",
  duplicate: "duplicate",
  changed: "changed",
  branch: "branch",
  memory: "memory",
  "memory-group": "memory",
  "memory-save": "",
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
  memory: Brain,
  "memory-group": Brain,
  "memory-save": Plus,
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
  // Children shown in a hover flyout beside a row (null = no submenu). Clicking
  // a flyout row selects it like any item; Enter on the parent row is the
  // keyboard path and stays with the composer.
  submenuFor?: (item: MentionItem) => MentionItem[] | null;
  // Muted, non-interactive hint under the rows. Rendered after every row so
  // listRef.children[selectedIndex] keeps pointing at rows.
  footer?: string;
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
  submenuFor,
  footer,
}: MentionMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);
  // The hover flyout: which row it belongs to and that row's rect. Opened by
  // hovering a row that has children; closed by hovering any other row, by the
  // item list changing, or by the keyboard highlight moving elsewhere — never
  // by leaving the row itself, so the pointer can cross the gap into it.
  const [submenu, setSubmenu] = useState<{ index: number; rect: DOMRect } | null>(null);
  const lastSelected = useRef(selectedIndex);

  useLayoutEffect(() => {
    setSubmenu(null);
  }, [items]);

  useLayoutEffect(() => {
    if (lastSelected.current === selectedIndex) return;
    lastSelected.current = selectedIndex;
    setSubmenu((s) => (s && s.index !== selectedIndex ? null : s));
  }, [selectedIndex]);

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
    <>
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
            onMouseEnter={(e) => {
              onHoverIndex(i);
              const children = submenuFor?.(item);
              if (children && children.length > 0) {
                setSubmenu({ index: i, rect: e.currentTarget.getBoundingClientRect() });
              } else {
                setSubmenu(null);
              }
            }}
            onClick={() => onSelect(item)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
              i === selectedIndex ? "bg-[var(--bg-active)]" : ""
            }`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center ${
                item.kind === "memory-save" ? "text-[var(--accent-purple)]" : "text-[var(--text-muted)]"
              }`}
            >
              <Icon size={14} strokeWidth={1.75} />
            </span>
            <span
              className={
                item.kind === "memory-save"
                  ? "min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--accent-purple)]"
                  : `truncate font-mono text-[13px] text-[var(--text-primary)] ${
                      item.detail ? "shrink-0" : "min-w-0 flex-1"
                    }`
              }
            >
              {item.label}
            </span>
            {item.detail && (
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-muted)]">
                {item.detail}
              </span>
            )}
            {KIND_LABEL[item.kind] && (
              <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wider text-[var(--text-muted)] opacity-60">
                {KIND_LABEL[item.kind]}
              </span>
            )}
          </button>
        );
      })}
      {footer && (
        <div className="mt-1 flex items-center gap-2.5 border-t border-[var(--border)] px-2.5 pb-1.5 pt-2 text-[13px] text-[var(--text-secondary)]">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--accent-purple)]">
            <Plus size={14} strokeWidth={1.75} />
          </span>
          {footer}
        </div>
      )}
      </div>
      {submenu && (() => {
        const children = submenuFor?.(items[submenu.index]) ?? null;
        if (!children || children.length === 0) return null;
        const flipLeft =
          submenu.rect.right + GAP + SUBMENU_WIDTH > window.innerWidth - EDGE_MARGIN;
        const left = flipLeft
          ? Math.max(EDGE_MARGIN, submenu.rect.left - GAP - SUBMENU_WIDTH)
          : submenu.rect.right + GAP;
        const maxHeight = Math.min(MAX_HEIGHT, window.innerHeight - 2 * EDGE_MARGIN);
        const top = Math.max(
          EDGE_MARGIN,
          Math.min(submenu.rect.top - 4, window.innerHeight - EDGE_MARGIN - maxHeight),
        );
        return (
          <div
            role="menu"
            style={{ position: "fixed", left, top, width: SUBMENU_WIDTH, maxHeight }}
            onMouseDown={(e) => e.preventDefault()}
            className="z-[9999] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.32)]"
          >
            {children.map((child, i) => {
              const ChildIcon = KIND_ICON[child.kind];
              return (
                <button
                  key={`${child.kind}:${child.insert}:${i}`}
                  type="button"
                  role="menuitem"
                  onClick={() => onSelect(child)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--bg-active)]"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center ${
                      child.kind === "memory-save" ? "text-[var(--accent-purple)]" : "text-[var(--text-muted)]"
                    }`}
                  >
                    <ChildIcon size={14} strokeWidth={1.75} />
                  </span>
                  <span
                    className={
                      child.kind === "memory-save"
                        ? "min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--accent-purple)]"
                        : `truncate font-mono text-[13px] text-[var(--text-primary)] ${
                            child.detail ? "shrink-0" : "min-w-0 flex-1"
                          }`
                    }
                  >
                    {child.label}
                  </span>
                  {child.detail && (
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-muted)]">
                      {child.detail}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })()}
    </>,
    document.body,
  );
}
