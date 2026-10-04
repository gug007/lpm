import { useLayoutEffect, useMemo, useRef } from "react";
import { useDndContext } from "@dnd-kit/core";
import type { ActionsLayout } from "../types";
import { groupDropId, movedByZoneResize } from "./actionsDndLayout";

// A preview that moves a button between rows makes dnd-kit re-measure only
// the lists that changed. The zones' buttons, drop areas and dots slide along
// with their row and would keep their old rects, so they are measured again
// here. Its own component: useDndContext re-renders on every pointer move.
export function RowsRemeasure({ layout }: { layout: ActionsLayout }) {
  const { measureDroppableContainers } = useDndContext();
  const ids = useMemo(
    () => [
      groupDropId("header"),
      groupDropId("footer"),
      ...movedByZoneResize(layout, "header"),
      ...movedByZoneResize(layout, "footer"),
    ],
    [layout],
  );
  const latest = useRef({ measureDroppableContainers, ids });
  latest.current = { measureDroppableContainers, ids };
  const rows = `${layout.header.join("\n")}\t${layout.footer.join("\n")}`;
  useLayoutEffect(() => {
    latest.current.measureDroppableContainers(latest.current.ids);
  }, [rows]);
  return null;
}
