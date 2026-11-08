import type { IBufferLine, ILink } from "@xterm/xterm";

// Where a fold or unfold control sits on a line of the mirror, in 1-based cells.
export interface ToggleHit {
  key: string;
  start: number;
  end: number;
}

// Only the hover underline and pointer: FilterMirror handles the click itself.
export function toggleLink({ start, end }: ToggleHit, line: number): ILink {
  return {
    range: { start: { x: start, y: line }, end: { x: end, y: line } },
    text: "",
    decorations: { pointerCursor: true, underline: true },
    activate: () => {},
  };
}

export function writtenCells(row: IBufferLine): number {
  for (let x = row.length; x > 0; x--) {
    if (row.getCell(x - 1)?.getChars()) return x;
  }
  return 0;
}
