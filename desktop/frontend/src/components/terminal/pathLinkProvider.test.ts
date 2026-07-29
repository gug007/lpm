import { describe, it, expect } from "vitest";
import type { IBuffer } from "@xterm/xterm";

import { findPathMatches, readLineWindow } from "./pathLinkProvider";

interface FakeCell {
  chars: string;
  width: number;
}

interface FakeRow {
  cells: FakeCell[];
  wrapped?: boolean;
}

// Lays text out the way xterm stores it: one cell per character, except wide
// glyphs, which take a width-2 cell followed by a zero-width filler.
function row(text: string, opts: { wide?: string[]; wrapped?: boolean } = {}): FakeRow {
  const cells: FakeCell[] = [];
  for (const ch of text) {
    if (opts.wide?.includes(ch)) {
      cells.push({ chars: ch, width: 2 }, { chars: "", width: 0 });
    } else {
      cells.push({ chars: ch, width: 1 });
    }
  }
  return { cells, wrapped: opts.wrapped };
}

function fakeBuffer(rows: FakeRow[], cols = 40): IBuffer {
  const scratch: FakeCell = { chars: "", width: 1 };
  const cellApi = (cell: FakeCell) => ({
    getChars: () => cell.chars,
    getWidth: () => cell.width,
  });
  return {
    getNullCell: () => cellApi(scratch),
    getLine: (y: number) => {
      const r = rows[y];
      if (!r) return undefined;
      return {
        isWrapped: !!r.wrapped,
        length: cols,
        getCell: (x: number) => {
          if (x >= cols) return undefined;
          const src = r.cells[x] ?? { chars: "", width: 1 };
          scratch.chars = src.chars;
          scratch.width = src.width;
          return cellApi(scratch);
        },
      };
    },
  } as unknown as IBuffer;
}

describe("findPathMatches", () => {
  it("maps a path to the columns it was drawn in", () => {
    const [m] = findPathMatches(fakeBuffer([row("see src/App.tsx here")]), 1);
    expect(m.text).toBe("src/App.tsx");
    expect(m.range).toEqual({ start: { x: 5, y: 1 }, end: { x: 15, y: 1 } });
  });

  it("shifts columns past a wide glyph", () => {
    // The emoji is one character but two cells, so the path starts at column 4
    // even though it sits at string index 2.
    const buf = fakeBuffer([row("✅ src/App.tsx", { wide: ["✅"] })]);
    const [m] = findPathMatches(buf, 1);
    expect(m.text).toBe("src/App.tsx");
    expect(m.range).toEqual({ start: { x: 4, y: 1 }, end: { x: 14, y: 1 } });
  });

  it("carries :line:col through", () => {
    const [m] = findPathMatches(fakeBuffer([row("at src/App.tsx:42:7 ok")]), 1);
    expect(m.raw).toBe("src/App.tsx");
    expect(m.line).toBe(42);
    expect(m.col).toBe(7);
    expect(m.range.end.x).toBe(19);
  });

  it("joins a path split across a wrapped row", () => {
    const buf = fakeBuffer([row("edit desktop/"), row("src/App.tsx now", { wrapped: true })], 13);
    const [m] = findPathMatches(buf, 2);
    expect(m.raw).toBe("desktop/src/App.tsx");
    expect(m.range).toEqual({ start: { x: 6, y: 1 }, end: { x: 11, y: 2 } });
  });

  it("finds the same wrapped path from either row", () => {
    const rows = [row("edit desktop/"), row("src/App.tsx now", { wrapped: true })];
    expect(findPathMatches(fakeBuffer(rows, 13), 1)).toEqual(
      findPathMatches(fakeBuffer(rows, 13), 2),
    );
  });

  it("ignores text without a separator or extension", () => {
    expect(findPathMatches(fakeBuffer([row("just words and README")]), 1)).toEqual([]);
  });

  it("returns nothing for a blank row", () => {
    expect(findPathMatches(fakeBuffer([row("   ")]), 1)).toEqual([]);
  });
});

describe("readLineWindow", () => {
  it("drops trailing padding so wrapped rows join tight", () => {
    const win = readLineWindow(fakeBuffer([row("ab")], 10), 0);
    expect(win.text).toBe("ab");
    expect(win.x).toEqual([0, 1]);
  });

  it("stops at a row that is not a wrapped continuation", () => {
    expect(readLineWindow(fakeBuffer([row("one"), row("two")], 3), 0).text).toBe("one");
  });
});
