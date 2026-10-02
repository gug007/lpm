import { describe, it, expect } from "vitest";
import type { IBuffer } from "@xterm/xterm";
import phoneTapSource from "../../../../../mobile/web/pathtap.js?raw";

import { findPathMatches, readLineWindow, scanLine } from "./pathLinkProvider";

const phoneModule = { exports: {} };
new Function("module", phoneTapSource)(phoneModule);
const phoneTap = phoneModule.exports as {
  pathsAt: (buf: IBuffer, cols: number, index: number, col: number) => { path: string; line: number }[];
};

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

const CASES: [string, { raw: string; text?: string; line?: number; col?: number } | null][] = [
  ["edited src/App.svelte", { raw: "src/App.svelte" }],
  ["android/app/build.gradle:3", { raw: "android/app/build.gradle", line: 3 }],
  ["config/.gitignore", { raw: "config/.gitignore" }],
  ["app/[id]/page.tsx", { raw: "app/[id]/page.tsx" }],
  ["app/(marketing)/[...slug]/page.tsx", { raw: "app/(marketing)/[...slug]/page.tsx" }],
  ["node_modules/@types/node/index.d.ts", { raw: "node_modules/@types/node/index.d.ts" }],
  ["⏺ Update(src/App.tsx)", { raw: "src/App.tsx", text: "src/App.tsx" }],
  ["> look at @src/components/App.tsx", { raw: "src/components/App.tsx" }],
  ["see [the guide](docs/guide.md).", { raw: "docs/guide.md" }],
  ["done: src/a.ts.", { raw: "src/a.ts", text: "src/a.ts" }],
  ["src/a.ts(10,5): error TS2322", { raw: "src/a.ts", text: "src/a.ts(10,5)", line: 10, col: 5 }],
  ["src/a.ts(7): warning", { raw: "src/a.ts", line: 7 }],
  ["src/a.ts#L42C5", { raw: "src/a.ts", line: 42, col: 5 }],
  ["src/a.ts#L10-L20", { raw: "src/a.ts", line: 10 }],
  ["at file:///Users/me/a.ts:3:9", { raw: "/Users/me/a.ts", text: "file:///Users/me/a.ts:3:9", line: 3, col: 9 }],
  ["42:~/.lpm/global.yml", { raw: "~/.lpm/global.yml" }],
  ["12:src/b.ts is the entry", { raw: "src/b.ts" }],
  ["3:./scripts/build.sh", { raw: "./scripts/build.sh" }],
  ["git show HEAD:src/a.ts", { raw: "src/a.ts" }],
  ["+dist/bundle.js", { raw: "dist/bundle.js" }],
  ["+./scripts/build.sh --prod", { raw: "./scripts/build.sh" }],
  ["lib/c++/vector.hpp", { raw: "lib/c++/vector.hpp" }],
  ["see https://example.com/a/b.js now", null],
  ["open http://localhost:3000/api/items.json", null],
  ["loaded webpack:///src/a.ts", null],
  ["mirror http://cdn.example.com/lib/x.min.js", null],
  ["the conf.d/ folder and foo/bar.d/baz", null],
];

describe("path formats", () => {
  it.each(CASES)("%s", (text, want) => {
    const [m] = findPathMatches(fakeBuffer([row(text)], 80), 1);
    if (!want) {
      expect(m).toBeUndefined();
      return;
    }
    expect(m?.raw).toBe(want.raw);
    if (want.text) expect(m.text).toBe(want.text);
    expect(m.line).toBe(want.line ?? 0);
    expect(m.col).toBe(want.col ?? 0);
  });

  // The phone's tap handler carries its own copy of the pattern; both must read
  // a line the same way.
  it.each(CASES)("phone reads %s the same way", (text, want) => {
    const col = want ? text.indexOf(want.raw) + 1 : text.indexOf("/") + 1;
    const tap = phoneTap.pathsAt(fakeBuffer([row(text)], 80), 80, 0, col);
    if (!want) {
      expect(tap).toEqual([]);
      return;
    }
    expect(tap[0]?.path).toBe(want.raw);
    expect(tap[0]?.line).toBe(want.line ?? 0);
  });
});

describe("several paths on a line", () => {
  it("links each path in grep output", () => {
    const ms = findPathMatches(fakeBuffer([row("docs/a.md:3:src/b.ts")], 80), 1);
    expect(ms.map((m) => [m.raw, m.line])).toEqual([
      ["docs/a.md", 3],
      ["src/b.ts", 0],
    ]);
  });
});

describe("phone rejoin", () => {
  // Claude Code wraps a long path itself, so the rows aren't marked wrapped.
  it.each([
    [["  app/marketing/abc/", "  [id]/page.tsx"], "app/marketing/abc/[id]/page.tsx"],
    [["  node_modules/aaa/", "  @types/node/a.d.ts"], "node_modules/aaa/@types/node/a.d.ts"],
  ])("rejoins %j", (rows, want) => {
    const buf = fakeBuffer(rows.map((r) => row(r)), 20);
    expect(phoneTap.pathsAt(buf, 20, 0, 4).map((m) => m.path)).toContain(want);
  });
});

describe("paths with spaces", () => {
  const spaced = (rows: FakeRow[], cols: number, line = 1) =>
    scanLine(fakeBuffer(rows, cols), line, cols).spaced;
  const raws = (rows: FakeRow[], cols = 120, line = 1) =>
    spaced(rows, cols, line).map((group) => group.map((m) => m.raw));

  it("offers every end a run could have, longest first", () => {
    const path = "/Users/me/Downloads/Expert Secrets (Russell Brunson) (z-library.sk, 1lib.sk, z-lib.sk).pdf";
    const [group] = spaced([row(path)], 120);
    expect(group.map((m) => m.raw)).toEqual([
      path,
      path.slice(0, -5),
      path.slice(0, path.indexOf(", z-lib")),
      path.slice(0, path.indexOf(", 1lib")),
    ]);
    expect(group[0].range).toEqual({ start: { x: 1, y: 1 }, end: { x: path.length, y: 1 } });
  });

  it("carries a position and a file:// prefix", () => {
    const [[m]] = spaced([row("at file:///Users/me/My App/main.ts:3:9 failed")], 80);
    expect(m).toMatchObject({ raw: "/Users/me/My App/main.ts", text: "file:///Users/me/My App/main.ts:3:9", line: 3, col: 9 });
    expect(raws([row("open ~/My Docs/plan v2.md:12 now")])).toEqual([["~/My Docs/plan v2.md"]]);
  });

  it("unescapes a shell-escaped path", () => {
    expect(raws([row("cp ~/My\\ Docs/a\\ \\(1\\).pdf .")])).toEqual([["~/My Docs/a (1).pdf"]]);
  });

  it("ends a run where another path starts", () => {
    expect(raws([row("/a/x y.pdf and /b/z w.pdf")])).toEqual([["/a/x y.pdf"], ["/b/z w.pdf"]]);
  });

  it("leaves paths without spaces and URLs to the plain pattern", () => {
    expect(raws([row("see /Users/me/a.ts here")])).toEqual([]);
    expect(raws([row("see https://example.com/My File.pdf")])).toEqual([]);
    expect(raws([row("at localhost:3000/My File.pdf")])).toEqual([]);
  });

  it("follows a path an agent wrapped at a blank, from either row", () => {
    const rows = [row("⏺ /Users/me/Downloads/How to Talk"), row("  to Anyone.pdf")];
    const want = "/Users/me/Downloads/How to Talk to Anyone.pdf";
    expect(raws(rows, 36, 1)).toEqual([[want]]);
    const [[m]] = spaced(rows, 36, 2);
    expect(m.raw).toBe(want);
    expect(m.range).toEqual({ start: { x: 3, y: 1 }, end: { x: 15, y: 2 } });
  });

  it("doesn't join a row that ended well short of the edge", () => {
    const rows = [row("⏺ /Users/me/How to"), row("  Anyone.pdf")];
    expect(raws(rows, 80, 1)).toEqual([]);
    expect(raws(rows, 80, 2)).toEqual([]);
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
