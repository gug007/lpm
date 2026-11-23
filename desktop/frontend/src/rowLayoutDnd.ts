// The Row builder's drag and drop as plain data: every side of every line is a
// zone holding detail ids, and the tray holds the hidden ones. A detail id is
// unique across all of them, so it doubles as the draggable's id.
import { ROW_DETAILS, type RowDetail, type RowLine, type RowSide } from "./sidebarRowLayout";

export const TRAY_ZONE = "tray";

export type ZoneItems = Record<string, RowDetail[]>;

export const zoneId = (line: number, side: RowSide) => `L${line}-${side}`;

export function itemsFromLines(lines: readonly RowLine[]): ZoneItems {
  const items: ZoneItems = {};
  const placed = new Set<RowDetail>();
  lines.forEach((line, i) => {
    items[zoneId(i, "left")] = [...line.left];
    items[zoneId(i, "right")] = [...line.right];
    [...line.left, ...line.right].forEach((d) => placed.add(d));
  });
  items[TRAY_ZONE] = ROW_DETAILS.filter((d) => !placed.has(d));
  return items;
}

export function linesFromItems(items: ZoneItems, lineCount: number): RowLine[] {
  return Array.from({ length: lineCount }, (_, i) => ({
    left: [...(items[zoneId(i, "left")] ?? [])],
    right: [...(items[zoneId(i, "right")] ?? [])],
  }));
}

// Puts `detail` at `index` among the details already on `toZone`, not counting
// itself, or back in the tray in the tray's own order.
export function placeAt(items: ZoneItems, detail: RowDetail, toZone: string, index: number): ZoneItems {
  if (!(toZone in items)) return items;
  const next: ZoneItems = {};
  for (const [zone, list] of Object.entries(items)) next[zone] = list.filter((d) => d !== detail);
  if (toZone === TRAY_ZONE) {
    next[TRAY_ZONE] = ROW_DETAILS.filter((d) => d === detail || next[TRAY_ZONE].includes(d));
    return next;
  }
  const list = next[toZone];
  list.splice(Math.max(0, Math.min(index, list.length)), 0, detail);
  return next;
}

// Where a drop at `x` lands among a side's details, by their boxes left to
// right: before the first one whose middle is past it.
export function dropIndex(x: number, boxes: readonly { left: number; width: number }[]): number {
  const at = boxes.findIndex((b) => x < b.left + b.width / 2);
  return at < 0 ? boxes.length : at;
}

export function sameItems(a: ZoneItems, b: ZoneItems): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k].join() === (b[k] ?? []).join());
}
