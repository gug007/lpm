import { useRef } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { LayerDraft } from "../../zoneLayerConfig";
import { PlusIcon } from "../icons";
import { ZoneLayerRow } from "./ZoneLayerRow";

// `id` keeps a row's identity through drags and edits, before a new layer has a key.
export interface LayerRow extends LayerDraft {
  id: string;
}

interface ZoneLayersEditorProps {
  rows: LayerRow[];
  onChange: (rows: LayerRow[]) => void;
  onDraggingChange?: (dragging: boolean) => void;
}

export function ZoneLayersEditor({ rows, onChange, onDraggingChange }: ZoneLayersEditorProps) {
  const added = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const fresh = (): LayerRow => ({ id: `new:${++added.current}`, label: "" });
  // A zone without layers already holds buttons: they need a first layer
  // beside the one being added.
  const add = () => onChange(rows.length === 0 ? [fresh(), fresh()] : [...rows, fresh()]);
  // Removed layers' buttons move into a layer that stays, so the last
  // existing one can't go.
  const lastKept = rows.filter((row) => row.key).length === 1;
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    onDraggingChange?.(false);
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((row) => row.id === active.id);
    const to = rows.findIndex((row) => row.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(rows, from, to));
  };
  return (
    <div className="mt-1.5">
      {rows.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => onDraggingChange?.(true)}
          onDragEnd={onDragEnd}
          onDragCancel={() => onDraggingChange?.(false)}
        >
          <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-1.5">
              {rows.map((row, i) => (
                <ZoneLayerRow
                  key={row.id}
                  id={row.id}
                  index={i}
                  label={row.label}
                  removable={!(lastKept && row.key)}
                  onRename={(label) => onChange(rows.map((r) => (r.id === row.id ? { ...r, label } : r)))}
                  onRemove={() => onChange(rows.filter((r) => r.id !== row.id))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <button
        type="button"
        onClick={add}
        className={`${rows.length > 0 ? "mt-1.5" : ""} inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]`}
      >
        <PlusIcon />
        Add layer
      </button>
    </div>
  );
}
