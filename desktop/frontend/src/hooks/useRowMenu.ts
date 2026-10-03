import { type MouseEvent, useCallback, useMemo, useState } from "react";
import type { ZoneDisplay } from "../types";
import { isEmptyRowSpace } from "../components/rowMenuTarget";

export interface RowMenuState {
  x: number;
  y: number;
  row: ZoneDisplay;
}

// A right-click on empty space in the header or footer row opens the app's row
// menu in place of the system one; everywhere else keeps its own menu.
export function useRowMenu() {
  const [menu, setMenu] = useState<RowMenuState | null>(null);
  const handlers = useMemo(() => {
    const openIn = (row: ZoneDisplay) => (e: MouseEvent<HTMLElement>) => {
      if (e.defaultPrevented || !isEmptyRowSpace(e.currentTarget, e.target)) return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, row });
    };
    return { onHeaderContextMenu: openIn("header"), onFooterContextMenu: openIn("footer") };
  }, []);
  const close = useCallback(() => setMenu(null), []);
  return { menu, close, ...handlers };
}
