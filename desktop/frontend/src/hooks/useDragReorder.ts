import { useRef, useState } from "react";

/**
 * Generic drag-to-reorder hook for a list of items keyed by string.
 *
 * Returns handlers to spread onto each draggable item plus `showDropAbove`
 * / `showDropBelow` helpers for rendering drop indicators. On drop, the
 * hook computes the new key order and invokes `onReorder`.
 */
export function useDragReorder<T>(
  items: T[],
  getKey: (item: T) => string,
  onReorder: (order: string[]) => void,
) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragRef = useRef(false);

  const handleDragStart = (e: React.DragEvent<HTMLElement>, idx: number) => {
    setDragIdx(idx);
    dragRef.current = true;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const newOrder = items.map(getKey);
      const [moved] = newOrder.splice(dragIdx, 1);
      newOrder.splice(overIdx, 0, moved);
      onReorder(newOrder);
    }
    setDragIdx(null);
    setOverIdx(null);
    dragRef.current = false;
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (idx !== overIdx) setOverIdx(idx);
  };

  const isDragging = dragIdx !== null;
  const showDropAbove = (idx: number) =>
    isDragging && overIdx === idx && dragIdx !== idx && dragIdx! > idx;
  const showDropBelow = (idx: number) =>
    isDragging && overIdx === idx && dragIdx !== idx && dragIdx! < idx;

  return {
    dragIdx,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    showDropAbove,
    showDropBelow,
  };
}
