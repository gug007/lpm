import { useRef, useState } from "react";
import { count } from "../../count";
import { countLayoutPanes, countLayoutTabs, type SavedLayout, type SavedLayoutNode } from "../../savedLayouts";
import {
  deleteLayout,
  replaceLayout,
  saveLayout,
  setDefaultLayout,
  useProjectLayouts,
} from "../../hooks/useSavedLayouts";
import { CheckIcon, PencilIcon, PlusIcon, RefreshIcon, TrashIcon } from "../icons";
import { RenameModal } from "../RenameModal";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSeparator } from "../ui/ContextMenuSeparator";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { ContextMenuSubmenu } from "../ui/ContextMenuSubmenu";
import { Tooltip } from "../ui/Tooltip";
import { IconBtn } from "./IconBtn";
import { LayoutsIcon } from "./icons";
import { LayoutThumb } from "./LayoutThumb";

interface PaneLayoutsButtonProps {
  projectName: string;
  // The panes on screen as a layout; null while nothing is open.
  capture: () => SavedLayoutNode | null;
  onOpen: (root: SavedLayoutNode) => void;
}

type Naming = { kind: "save" } | { kind: "rename"; layout: SavedLayout };

function summary(root: SavedLayoutNode): string {
  return `${count(countLayoutPanes(root), "pane", "panes")} · ${count(countLayoutTabs(root), "tab", "tabs")}`;
}

/** The pane header's layouts menu: open a saved arrangement of panes and
 *  tabs, save the one on screen, and pick which opens by itself. */
export function PaneLayoutsButton({ projectName, capture, onOpen }: PaneLayoutsButtonProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [naming, setNaming] = useState<Naming | null>(null);
  const { layouts, defaultId } = useProjectLayouts(projectName);

  const toggle = () => {
    if (menu) return setMenu(null);
    const r = ref.current?.getBoundingClientRect();
    if (r) setMenu({ x: r.right, y: r.bottom + 4 });
  };
  const pick = (fn: () => void) => () => {
    setMenu(null);
    fn();
  };
  const current = menu ? capture() : null;
  const canSave = current !== null && countLayoutTabs(current) > 0;

  return (
    <span ref={ref} className="inline-flex" onMouseDown={(e) => e.stopPropagation()}>
      <Tooltip content="Layouts" side="bottom" align="end" disabled={!!menu}>
        <IconBtn onClick={toggle} ariaLabel="Layouts" active={!!menu}>
          <LayoutsIcon />
        </IconBtn>
      </Tooltip>
      {menu && (
        <ContextMenuShell x={menu.x} y={menu.y} align="end" minWidth={220} onClose={() => setMenu(null)}>
          {layouts.length === 0 && (
            <ContextMenuItem
              label="No saved layouts"
              description="Save how these panes are arranged to open them again in one click."
              disabled
              onClick={() => {}}
            />
          )}
          {layouts.map((layout) => {
            const isDefault = layout.id === defaultId;
            return (
              <ContextMenuSubmenu
                key={layout.id}
                label={
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate">{layout.name}</span>
                    {isDefault && <span className="shrink-0 text-[11px] text-[var(--text-muted)]">Default</span>}
                  </span>
                }
                icon={<LayoutThumb node={layout.root} />}
                onActivate={pick(() => onOpen(layout.root))}
              >
                <ContextMenuItem
                  label="Open"
                  description={summary(layout.root)}
                  icon={<LayoutThumb node={layout.root} />}
                  onClick={pick(() => onOpen(layout.root))}
                />
                <ContextMenuItem
                  label="Open by default"
                  description="When the project has no terminals open"
                  icon={isDefault ? <CheckIcon /> : <span className="w-[14px]" />}
                  onClick={pick(() => setDefaultLayout(projectName, isDefault ? undefined : layout.id))}
                />
                <ContextMenuSeparator />
                <ContextMenuItem
                  label="Replace with current panes"
                  icon={<RefreshIcon />}
                  disabled={!canSave}
                  onClick={pick(() => current && replaceLayout(projectName, { ...layout, root: current }))}
                />
                <ContextMenuItem
                  label="Rename…"
                  icon={<PencilIcon />}
                  onClick={pick(() => setNaming({ kind: "rename", layout }))}
                />
                <ContextMenuItem
                  label="Delete"
                  icon={<TrashIcon />}
                  destructive
                  onClick={pick(() => deleteLayout(projectName, layout.id))}
                />
              </ContextMenuSubmenu>
            );
          })}
          <ContextMenuSeparator />
          <ContextMenuItem
            label="Save current layout…"
            icon={<PlusIcon />}
            disabled={!canSave}
            title={canSave ? undefined : "Open a terminal first"}
            onClick={pick(() => setNaming({ kind: "save" }))}
          />
        </ContextMenuShell>
      )}
      <RenameModal
        open={naming !== null}
        title={naming?.kind === "rename" ? "Rename layout" : "Save layout"}
        description={
          naming?.kind === "rename"
            ? undefined
            : "Saves these panes and what runs in each. Opening it starts them fresh: actions run again and agents start new conversations."
        }
        initialValue={naming?.kind === "rename" ? naming.layout.name : ""}
        placeholder="Agents and server"
        submitLabel={() => (naming?.kind === "rename" ? "Rename" : "Save")}
        onClose={() => setNaming(null)}
        onSubmit={(value) => {
          const name = value.trim();
          if (!name || !naming) return;
          if (naming.kind === "rename") {
            replaceLayout(projectName, { ...naming.layout, name });
          } else {
            const root = capture();
            if (root) saveLayout(projectName, name, root);
          }
          setNaming(null);
        }}
      />
    </span>
  );
}
