import { useState, type ReactNode } from "react";
import { useEventListener } from "../hooks/useEventListener";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { NAV_UTILITY_IDS, type NavItemId } from "../sidebarNav";
import { MoreHorizontalIcon, UndoIcon } from "./icons";
import { SidebarNavRowMenu } from "./SidebarNavRowMenu";
import { SidebarNavRow, type RowMenuAnchor, type SidebarNavEntry } from "./SidebarNavRow";
import { MENU_PANEL_CLASS } from "./ui/ContextMenuShell";

interface SidebarFooterMoreProps {
  entries: SidebarNavEntry[];
  // What the collapsed button carries for the rows folded inside it: agent
  // signals on the left, a running dot or unread count on the right.
  signals: ReactNode;
  badge: ReactNode;
  hints: string[];
  isDefault: boolean;
  onMove: (id: NavItemId) => void;
  onReset: () => void;
}

interface RowMenu {
  entry: SidebarNavEntry;
  x: number;
  y: number;
}

export function SidebarFooterMore({ entries, signals, badge, hints, isDefault, onMove, onReset }: SidebarFooterMoreProps) {
  const [open, setOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<RowMenu | null>(null);
  // The row menu renders inside this boundary, so opening one is not an outside
  // click; Escape has to be handed to it rather than closing everything at once.
  const ref = useOutsideClick<HTMLDivElement>(() => {
    setRowMenu(null);
    setOpen(false);
  }, open);
  useEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  }, document, open && rowMenu === null);

  const close = () => {
    setRowMenu(null);
    setOpen(false);
  };

  const anyActive = entries.some((entry) => entry.active);
  const dividerAt = entries.findIndex((entry) => NAV_UTILITY_IDS.includes(entry.id));

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
          open || anyActive
            ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
        title={hints.length > 0 ? `More — ${hints.join(", ")}` : "Activity, settings, and more views"}
        aria-label="More"
        aria-expanded={open}
      >
        <MoreHorizontalIcon />
        More
        <span className="ml-auto flex items-center gap-2">
          {signals}
          {badge}
        </span>
      </button>
      {open && (
        <div className={`absolute bottom-full left-0 z-[80] mb-1.5 w-full min-w-[12rem] px-1 ${MENU_PANEL_CLASS}`}>
          {entries.map((entry, i) => (
            <div key={entry.id}>
              {i === dividerAt && i > 0 && <div className="my-1 h-px bg-[var(--border)]" />}
              <SidebarNavRow
                entry={{
                  ...entry,
                  onSelect: () => {
                    close();
                    entry.onSelect();
                  },
                }}
                menuOpen={rowMenu?.entry.id === entry.id}
                onOpenMenu={(anchor: RowMenuAnchor) => setRowMenu({ entry, ...anchor })}
              />
            </div>
          ))}
          {!isDefault && (
            <>
              <div className="my-1 h-px bg-[var(--border)]" />
              <button
                onClick={() => {
                  close();
                  onReset();
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                title="Put every row back where it started"
              >
                <span className="shrink-0">
                  <UndoIcon />
                </span>
                Reset to default
              </button>
            </>
          )}
        </div>
      )}
      {rowMenu && (
        <SidebarNavRowMenu
          x={rowMenu.x}
          y={rowMenu.y}
          label={rowMenu.entry.label}
          inSidebar={false}
          isDefault={isDefault}
          onMove={() => onMove(rowMenu.entry.id)}
          onReset={onReset}
          onClose={() => setRowMenu(null)}
        />
      )}
    </div>
  );
}
