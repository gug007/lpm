import { Fragment, useEffect, useRef, useState, type MouseEvent } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlusIcon, XIcon } from "./icons";

export interface ComposerTabView {
  id: string;
  label: string;
}

interface ComposerTabStripProps {
  tabs: ComposerTabView[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  onReorder: (ids: string[]) => void;
}

// Matches the terminal tab strip's insertion marker (TerminalTabDnd.tsx) so the
// two drag interactions look identical: a 3px rounded cyan bar with a soft glow.
const INDICATOR_BAR =
  "h-5 w-[3px] rounded-full bg-[var(--accent-cyan)] shadow-[0_0_8px_var(--accent-cyan)]";

// Absolute so the host tab doesn't reflow when the bar appears at its left edge.
function LeadingDropIndicator() {
  return (
    <span
      aria-hidden
      className={`${INDICATOR_BAR} pointer-events-none absolute left-[-2px] top-1/2 -translate-y-1/2`}
    />
  );
}

interface SortableComposerTabProps {
  tab: ComposerTabView;
  active: boolean;
  separator: boolean;
  separatorHidden: boolean;
  showLeadingIndicator: boolean;
  onSelect: (id: string) => void;
  onClose: (e: MouseEvent, id: string) => void;
  activeRef?: React.Ref<HTMLDivElement>;
}

// One draggable tab. {...listeners} (no {...attributes}) sits on the wrapper so
// the inner select/close buttons stay the only focusable controls — same choice
// as TerminalTabDnd's SortableTab. The 5px pointer threshold lets a plain click
// still reach onSelect / onClose.
function SortableComposerTab({
  tab,
  active,
  separator,
  separatorHidden,
  showLeadingIndicator,
  onSelect,
  onClose,
  activeRef,
}: SortableComposerTabProps) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id });
  const label = tab.label || "New input";
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : undefined,
    position: "relative",
  };
  return (
    <Fragment>
      <div ref={setNodeRef} style={style} {...listeners} className="flex items-center">
        {showLeadingIndicator && !isDragging && <LeadingDropIndicator />}
        <div
          ref={active ? activeRef : undefined}
          className={`group flex h-6 w-[160px] min-w-[52px] shrink items-center rounded-t-lg text-[11px] font-medium transition-colors ${
            active
              ? "composer-tab-active text-[var(--text-primary)]"
              : "text-[var(--terminal-header-text)] hover:bg-[var(--terminal-header-hover)] hover:text-[var(--terminal-tab-active)]"
          }`}
        >
          <button
            type="button"
            onClick={() => onSelect(tab.id)}
            title={label}
            aria-current={active ? "true" : undefined}
            className="min-w-0 flex-1 truncate py-0.5 pl-2.5 pr-1 text-left outline-none"
          >
            {label}
          </button>
          <button
            type="button"
            onClick={(e) => onClose(e, tab.id)}
            aria-label="Close input"
            title="Close input"
            className={`mr-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded outline-none transition-opacity hover:text-[var(--accent-red)] focus-visible:text-[var(--accent-red)] focus-visible:opacity-100 [&>svg]:h-3 [&>svg]:w-3 ${
              active ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <XIcon />
          </button>
        </div>
      </div>
      {separator && (
        <span
          aria-hidden
          className={`h-3.5 w-px shrink-0 bg-[var(--border)] transition-opacity ${
            separatorHidden ? "opacity-0" : "opacity-100"
          }`}
        />
      )}
    </Fragment>
  );
}

// A Chrome-style row of prepared inputs shown above the composer when more than
// one draft is open, drag-reorderable with the same @dnd-kit pattern as the
// terminal tabs. The active tab is a raised pill; a trailing "+" opens another.
export function ComposerTabStrip({ tabs, activeId, onSelect, onClose, onAdd, onReorder }: ComposerTabStripProps) {
  const activeRef = useRef<HTMLDivElement>(null);
  // Index of the tab the drag is currently over, or null when no drag is in
  // progress. Drives the cyan insertion bar on that tab.
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Pointer only, 5px activation: a quick click still falls through to the tab's
  // own handlers, and no KeyboardSensor hijacks Enter/Space on the buttons.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Keep the active tab visible when the row overflows.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeId]);

  const handleClose = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    onClose(id);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const overId = e.over ? String(e.over.id) : null;
    setOverIndex(overId ? tabs.findIndex((t) => t.id === overId) : null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setOverIndex(null);
    const { active, over } = e;
    if (!over) return;
    const from = tabs.findIndex((t) => t.id === String(active.id));
    const to = tabs.findIndex((t) => t.id === String(over.id));
    if (from < 0 || to < 0 || from === to) return;
    onReorder(arrayMove(tabs.map((t) => t.id), from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setOverIndex(null)}
    >
      <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
        <div className="no-scrollbar flex items-center overflow-x-auto pl-3">
          {tabs.map((tab, i) => {
            const active = tab.id === activeId;
            const nextActive = i + 1 < tabs.length && tabs[i + 1].id === activeId;
            return (
              <SortableComposerTab
                key={tab.id}
                tab={tab}
                active={active}
                separator={i < tabs.length - 1}
                separatorHidden={active || nextActive}
                showLeadingIndicator={overIndex === i}
                onSelect={onSelect}
                onClose={handleClose}
                activeRef={activeRef}
              />
            );
          })}
          <button
            type="button"
            onClick={onAdd}
            aria-label="New input"
            title="New input"
            className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--terminal-header-hover)] hover:text-[var(--text-primary)] [&>svg]:h-3.5 [&>svg]:w-3.5"
          >
            <PlusIcon />
          </button>
        </div>
      </SortableContext>
    </DndContext>
  );
}
