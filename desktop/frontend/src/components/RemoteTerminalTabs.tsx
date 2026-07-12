import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Pin, PinOff } from "lucide-react";
import { HeaderTab } from "./terminal/HeaderTab";
import { ContextMenuShell } from "./ui/ContextMenuShell";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { PencilIcon, XIcon } from "./icons";
import { tabPort } from "../remoteTabs";
import type { RemoteTerminal } from "../store/peers";

interface TabStatus {
  waiting?: boolean;
  shimmer?: boolean;
  done?: boolean;
  error?: boolean;
}

interface RemoteTerminalTabsProps {
  terminals: RemoteTerminal[];
  activeId: string;
  ports: Record<string, number>;
  onOpen: (id: string) => void;
  onClose: (id: string, label: string) => void;
  onRename: (id: string, current: string) => void;
  onTogglePin: (id: string) => void;
  onReorder: (order: string[]) => void;
  tabState: (id: string) => TabStatus;
}

interface TabMenu {
  id: string;
  label: string;
  pinned: boolean;
  x: number;
  y: number;
}

// The remote view's interactive-terminal tab strip: drag to reorder (relayed via
// `reorderTerminals`) and a right-click menu to rename / pin / close, mirroring
// the local strip. PointerSensor only — a KeyboardSensor without a drag handle
// hijacks Enter/Space into un-endable drags. Reorders apply optimistically and
// reconcile when the peer's refreshed `terminals` list arrives.
export function RemoteTerminalTabs({
  terminals,
  activeId,
  ports,
  onOpen,
  onClose,
  onRename,
  onTogglePin,
  onReorder,
  tabState,
}: RemoteTerminalTabsProps) {
  const [orderIds, setOrderIds] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<RemoteTerminal | null>(null);
  const [menu, setMenu] = useState<TabMenu | null>(null);
  // The tab order frozen at drag start, so a `terminals` push arriving mid-drag
  // can't mutate the SortableContext items under dnd-kit (which mis-drops).
  const dragSnapshot = useRef<string[] | null>(null);
  // Latest optimistic order + drag flag, read by the [terminals]-only reconcile
  // effect without re-running it (or capturing a stale closure).
  const stateRef = useRef<{ pending: string[] | null; dragging: boolean }>({
    pending: null,
    dragging: false,
  });
  stateRef.current = { pending: orderIds, dragging: dragging !== null };

  // Reconcile the optimistic order against the peer's refreshed list. The owner
  // acks `reorderTerminals` BEFORE syncing the new order into Rust, so the
  // ack-triggered `terminals` refetch can echo the PRE-reorder order — clearing
  // the optimistic state here would snap the tabs back until an unrelated
  // refresh. So keep the optimistic order until the authoritative list actually
  // reflects it; only drop it when membership changes (a tab added/closed, which
  // the optimistic order can't represent) or once the reorder has synced through.
  // Never touch it mid-drag.
  useEffect(() => {
    const { pending, dragging: isDragging } = stateRef.current;
    if (isDragging || !pending) return;
    const incoming = terminals.map((t) => t.id);
    const sameSet =
      incoming.length === pending.length &&
      incoming.every((id) => pending.includes(id));
    if (!sameSet) {
      setOrderIds(null);
      return;
    }
    if (incoming.every((id, i) => id === pending[i])) setOrderIds(null);
  }, [terminals]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // During a drag the order is pinned to the snapshot; otherwise it follows the
  // optimistic order, falling back to the authoritative list.
  const activeOrder = dragging ? dragSnapshot.current : orderIds;
  const ordered =
    activeOrder === null
      ? terminals
      : (activeOrder
          .map((id) => terminals.find((t) => t.id === id))
          .filter((t): t is RemoteTerminal => !!t));
  const ids = ordered.map((t) => t.id);

  const handleDragStart = (e: DragStartEvent) => {
    dragSnapshot.current = ids;
    setDragging(terminals.find((t) => t.id === String(e.active.id)) ?? null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    setOrderIds(next);
    onReorder(next);
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          {ordered.map((t) => (
            <SortableTab key={t.id} id={t.id}>
              <HeaderTab
                label={t.label || t.id}
                active={activeId === t.id}
                pinned={t.pinned}
                onClick={() => onOpen(t.id)}
                onClose={() => onClose(t.id, t.label)}
                onContextMenu={(e: MouseEvent) => {
                  e.preventDefault();
                  setMenu({
                    id: t.id,
                    label: t.label || t.id,
                    pinned: !!t.pinned,
                    x: e.clientX,
                    y: e.clientY,
                  });
                }}
                trailing={
                  tabPort(t.label, ports) ? (
                    <span className="opacity-60">:{tabPort(t.label, ports)}</span>
                  ) : undefined
                }
                {...tabState(t.id)}
              />
            </SortableTab>
          ))}
        </SortableContext>
        <DragOverlay className="pointer-events-none" dropAnimation={null}>
          {dragging ? (
            <HeaderTab
              label={dragging.label || dragging.id}
              active
              pinned={dragging.pinned}
              onClick={() => {}}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {menu && (
        <ContextMenuShell x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <ContextMenuItem
            label="Rename"
            icon={<PencilIcon size={12} />}
            onClick={() => {
              onRename(menu.id, menu.label);
              setMenu(null);
            }}
          />
          <ContextMenuItem
            label={menu.pinned ? "Unpin" : "Pin"}
            icon={menu.pinned ? <PinOff size={12} /> : <Pin size={12} />}
            onClick={() => {
              onTogglePin(menu.id);
              setMenu(null);
            }}
          />
          <ContextMenuItem
            label="Close"
            icon={<XIcon />}
            destructive
            onClick={() => {
              onClose(menu.id, menu.label);
              setMenu(null);
            }}
          />
        </ContextMenuShell>
      )}
    </>
  );
}

// No {...attributes} spread — it would wrap the interactive tab in a focusable
// role="button" that WebKit then focuses on click.
function SortableTab({ id, children }: { id: string; children: ReactNode }) {
  const { listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : undefined,
        position: "relative",
      }}
      className="shrink-0"
      {...listeners}
    >
      {children}
    </div>
  );
}
