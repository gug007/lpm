import { create } from "zustand";

// The zoom this window's page is drawn at now (the interface size, see
// interfaceSize.ts). A CSS pixel on the page covers this many of the window's
// own points.
export const useInterfaceZoom = create<{ zoom: number }>(() => ({ zoom: 1 }));

export function interfaceZoom(): number {
  return useInterfaceZoom.getState().zoom;
}

/** A position or rect measured on the page, in the window's own points: what a
 *  native view lpm places over the page (a browser pane, a popup's page, the
 *  share sheet) is positioned in. */
export function toWindowPoints<T extends { [K in keyof T]: number }>(rect: T): T {
  const zoom = interfaceZoom();
  if (zoom === 1) return rect;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(rect)) out[key] = (value as number) * zoom;
  return out as T;
}
