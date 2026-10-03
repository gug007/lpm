import type { CSSProperties } from "react";
import type { ZoneDisplay, ZoneRows } from "../types";

// A zone spans whole rows of its bar's grid. Header buttons are 32px tall and
// 8px apart. A footer button (compact: px-2.5 py-1 text-[11px] and a 1px
// border) measures 26.5px in Chrome; footer rows wrap 4px apart (gap-1).
const ROW_GRID: Record<ZoneDisplay, { rowPx: number; gapPx: number }> = {
  header: { rowPx: 32, gapPx: 8 },
  footer: { rowPx: 26.5, gapPx: 4 },
};
const BORDER_PX = 1;

// One footer row, for what must line up with the footer's first row.
export const FOOTER_ROW_PX = ROW_GRID.footer.rowPx;

// The one spacing inside a zone: frame to buttons, between rows, between columns.
export const ZONE_GAP_PX = 4;
// Only an empty zone keeps it, so there is something to drop onto.
export const ZONE_MIN_WIDTH_PX = 150;
export const ZONE_ROW_CHOICES: readonly ZoneRows[] = [1, 2, 3];

// Buttons fill top to bottom, then the next column.
export const ZONE_GRID_CLASS = "grid h-full grid-flow-col justify-start";

export function zoneGridStyle(rows: ZoneRows, holdsButtons: boolean): CSSProperties {
  return {
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    gap: ZONE_GAP_PX,
    minWidth: holdsButtons ? undefined : ZONE_MIN_WIDTH_PX,
  };
}

// Where a button added at a zone's end goes: an empty zone's first cell, the
// free cell under the last column's buttons, or a new column.
export type ZoneEndSlot = "first" | "cell" | "column";

export function zoneEndSlot(count: number, rows: ZoneRows): ZoneEndSlot {
  if (count === 0) return "first";
  return count % rows === 0 ? "column" : "cell";
}

export function zoneHeight(rows: ZoneRows, display: ZoneDisplay = "header"): number {
  const { rowPx, gapPx } = ROW_GRID[display];
  return rows * rowPx + (rows - 1) * gapPx;
}

// Exact rows and one even spacing leave the button height to give way:
// 22 / 29 / 31.33px in the header, 16.5 / 21.5 / 23.17px in the footer.
export function zoneButtonHeight(rows: ZoneRows, display: ZoneDisplay = "header"): number {
  return (zoneHeight(rows, display) - 2 * BORDER_PX - (rows + 1) * ZONE_GAP_PX) / rows;
}

// Inside a footer zone, buttons take the footer's colours.
export function zoneButtonSize(display: ZoneDisplay): "zone" | "footerZone" {
  return display === "footer" ? "footerZone" : "zone";
}

export function zoneRowsLabel(rows: ZoneRows): string {
  return rows === 1 ? "1 row" : `${rows} rows`;
}
