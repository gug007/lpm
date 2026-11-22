import type { MiniViewEdge } from "../../hooks/useMiniViewResize";

const EDGES: { edge: MiniViewEdge; className: string }[] = [
  { edge: "top", className: "inset-x-0 top-0 h-1.5 cursor-ns-resize" },
  { edge: "left", className: "inset-y-0 left-0 w-1.5 cursor-ew-resize" },
  { edge: "corner", className: "left-0 top-0 h-3 w-3 cursor-nwse-resize" },
];

/** The mini view's top and left edges and the corner between them, the sides
 *  it grows from. A double-click puts it back to its first size. */
export function MiniViewResizeEdges({
  onStart,
  onReset,
}: {
  onStart: (e: React.PointerEvent<HTMLElement>, edge: MiniViewEdge) => void;
  onReset: () => void;
}) {
  return (
    <>
      {EDGES.map(({ edge, className }) => (
        <div
          key={edge}
          aria-hidden
          data-mini-view-resize={edge}
          title="Drag to resize"
          onPointerDown={(e) => onStart(e, edge)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
          className={`absolute z-10 ${className}`}
        />
      ))}
    </>
  );
}
