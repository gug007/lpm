import { useState } from "react";
import { useEventListener } from "../hooks/useEventListener";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { NAV_UTILITY_IDS, type NavItemId } from "../sidebarNav";
import { MoreHorizontalIcon, UndoIcon } from "./icons";
import { SidebarNavRowMenu } from "./SidebarNavRowMenu";
import { SidebarNavRow, type RowMenuAnchor, type SidebarNavEntry } from "./SidebarNavRow";
import { SidebarNavSubmenuRow } from "./SidebarNavSubmenuRow";
import { MENU_PANEL_CLASS } from "./ui/ContextMenuShell";

interface SidebarFooterMoreProps {
  entries: SidebarNavEntry[];
  isDefault: boolean;
  onMove: (id: NavItemId) => void;
  onReset: () => void;
}

interface RowMenu {
  entry: SidebarNavEntry;
  x: number;
  y: number;
}

export function SidebarFooterMore({ entries, isDefault, onMove, onReset }: SidebarFooterMoreProps) {
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
  // The collapsed button speaks for the rows folded inside it.
  const hints = entries.flatMap((entry) => entry.menuHints ?? []);
  const dividerAt = entries.findIndex((entry) => NAV_UTILITY_IDS.includes(entry.id));

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      {/* The badges sit beside the button, not in it, so one with a button of
          its own takes its own clicks; the button's ::after covers the rest of the row. */}
      <div
        className={`relative flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
          open || anyActive
            ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
      >
        <button
          onClick={() => (open ? close() : setOpen(true))}
          className="flex items-center gap-2 after:absolute after:inset-0 after:rounded-md"
          title={hints.length > 0 ? `More — ${hints.join(", ")}` : "Automations, usage, and more views"}
          aria-label="More"
          aria-expanded={open}
        >
          <MoreHorizontalIcon />
          More
        </button>
        <span className="flex items-center gap-1" onClick={close}>
          {entries.map((entry) => entry.menuBadge && <span key={entry.id} className="flex">{entry.menuBadge}</span>)}
        </span>
      </div>
      {open && (
        <div className={`absolute bottom-full left-0 z-[80] mb-1.5 w-max min-w-[max(100%,12rem)] px-1 ${MENU_PANEL_CLASS}`}>
          {entries.map((entry, i) => (
            <div key={entry.id}>
              {i === dividerAt && i > 0 && <div className="my-1 h-px bg-[var(--border)]" />}
              {entry.submenu ? (
                <SidebarNavSubmenuRow
                  entry={{ ...entry, agents: undefined }}
                  panel={entry.submenu}
                  menu={ref}
                  menuOpen={rowMenu?.entry.id === entry.id}
                  onOpenMenu={(anchor: RowMenuAnchor) => setRowMenu({ entry, ...anchor })}
                />
              ) : (
                <SidebarNavRow
                  entry={{
                    ...entry,
                    agents: undefined,
                    onSelect: () => {
                      close();
                      entry.onSelect();
                    },
                  }}
                  menuOpen={rowMenu?.entry.id === entry.id}
                  onOpenMenu={(anchor: RowMenuAnchor) => setRowMenu({ entry, ...anchor })}
                  inMenu
                />
              )}
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
