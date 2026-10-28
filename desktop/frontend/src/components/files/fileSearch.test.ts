import { describe, expect, it } from "vitest";
import { matchKey, resultSummary, searchRows, type FileMatches } from "./fileSearch";

const hit = (line: number, col: number) => ({ line, col, len: 3, text: "foo", start: 0 });
const FILES: FileMatches[] = [
  { path: "src/a.ts", matches: [hit(1, 1), hit(4, 7)] },
  { path: "b.md", matches: [hit(2, 3)] },
];

describe("searchRows", () => {
  it("lists each file over its occurrences", () => {
    expect(searchRows(FILES, new Set()).map((r) => r.key)).toEqual([
      "src/a.ts",
      "src/a.ts:1:1",
      "src/a.ts:4:7",
      "b.md",
      "b.md:2:3",
    ]);
  });

  it("leaves a collapsed file's occurrences out", () => {
    const rows = searchRows(FILES, new Set(["src/a.ts"]));
    expect(rows.map((r) => r.key)).toEqual(["src/a.ts", "b.md", "b.md:2:3"]);
    expect(rows[0]).toMatchObject({ kind: "file", count: 2, collapsed: true });
  });

  it("keys an occurrence by its file and place", () => {
    expect(matchKey("b.md", { line: 2, col: 3 })).toBe("b.md:2:3");
  });
});

describe("resultSummary", () => {
  it("counts results and files", () => {
    expect(resultSummary({ files: FILES, truncated: false })).toBe("3 results in 2 files");
    expect(resultSummary({ files: [FILES[1]], truncated: false })).toBe("1 result in 1 file");
    expect(resultSummary({ files: [], truncated: false })).toBe("No results");
  });

  it("says when the search stopped early", () => {
    expect(resultSummary({ files: FILES, truncated: true })).toBe("3 results in 2 files · the first ones found");
  });
});
