import type { ReactNode } from "react";
import type { NavItemId } from "../sidebarNav";
import { MoreVerticalIcon } from "./icons";
import { Tooltip } from "./ui/Tooltip";

// One footer destination, rendered the same whether it sits in the sidebar or
// in the More menu — moving it between the two must not change how it reads.
export interface SidebarNavEntry {
  id: NavItemId;
  label: string;
  icon: ReactNode;
  active: boolean;
  onSelect: () => void;
  // Badges and counts that ride on the right of the row.
  trailing?: ReactNode;
  description?: string;
}

export interface RowMenuAnchor {
  x: number;
  y: number;
}

interface SidebarNavRowProps {
  entry: SidebarNavEntry;
  // This row's options menu is the one currently open.
  menuOpen: boolean;
  onOpenMenu: (anchor: RowMenuAnchor) => void;
}

export function SidebarNavRow({ entry, menuOpen, onOpenMenu }: SidebarNavRowProps) {
  const row = (
    // `group-hover:pr-9` slides the trailing badges clear of the options button
    // rather than letting it cover them; the button only shows on hover, so the
    // row is never padded for something the user cannot see.
    <div className="group relative flex w-full items-center">
      <button
        type="button"
        onClick={entry.onSelect}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenMenu({ x: e.clientX, y: e.clientY });
        }}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors group-hover:pr-9 ${
          entry.active
            ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
      >
        <span className="shrink-0">{entry.icon}</span>
        <span className="truncate">{entry.label}</span>
        {entry.trailing && (
          <span className="ml-auto flex items-center gap-2 pl-2">{entry.trailing}</span>
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          // useOutsideClick's mousedown already closed the menu — skip the reopen so the second click toggles off.
          if (menuOpen) return;
          // Beside the row rather than below it: the footer is already at the
          // bottom edge, so a menu dropped downwards would only fold back over
          // the rows the user is rearranging.
          const rect = e.currentTarget.getBoundingClientRect();
          onOpenMenu({ x: rect.right + 4, y: rect.top });
        }}
        className={`absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:opacity-100 ${
          menuOpen
            ? "opacity-100"
            : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
        }`}
        title="Move this row, or reset the layout"
        aria-label={`More options for ${entry.label}`}
      >
        <MoreVerticalIcon />
      </button>
    </div>
  );

  if (!entry.description) return row;
  return (
    <Tooltip
      content={entry.description}
      side="right"
      wide
      delay={500}
      triggerClassName="flex w-full"
    >
      {row}
    </Tooltip>
  );
}
