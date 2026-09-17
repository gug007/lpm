import { describe, expect, it } from "vitest";
import { isSubsequence, rankFiles, type IndexEntry } from "./filesFilter";

const file = (path: string): IndexEntry => ({ path, isDir: false });
const dir = (path: string): IndexEntry => ({ path, isDir: true });

const index: IndexEntry[] = [
  file("src/components/Sidebar.tsx"),
  file("src/components/SidebarUsage.tsx"),
  file("docs/sidebar-notes.md"),
  dir("src/components"),
  file("README.md"),
  file("src/lib.rs"),
  file("src/stdlib.ts"),
  file("lib/util.ts"),
  file("src/l/i/b.ts"),
];

describe("rankFiles", () => {
  it("returns nothing for a blank query", () => {
    expect(rankFiles(index, "")).toEqual([]);
    expect(rankFiles(index, "   ")).toEqual([]);
  });

  it("ranks a name prefix, then a name hit, then a path hit, then a subsequence", () => {
    expect(rankFiles(index, "lib").map((e) => e.path)).toEqual([
      "src/lib.rs",
      "src/stdlib.ts",
      "lib/util.ts",
      "src/l/i/b.ts",
    ]);
  });

  it("breaks ties within a rank by path length", () => {
    expect(rankFiles(index, "sidebar").map((e) => e.path)).toEqual([
      "docs/sidebar-notes.md",
      "src/components/Sidebar.tsx",
      "src/components/SidebarUsage.tsx",
    ]);
  });

  it("matches characters in order as a last resort", () => {
    expect(isSubsequence("sbts", "src/sb.ts")).toBe(true);
    expect(isSubsequence("tsb", "src/sb.ts")).toBe(false);
    expect(rankFiles(index, "README.md").map((e) => e.path)).toEqual(["README.md"]);
  });

  it("requires every space-separated term somewhere in the path", () => {
    expect(rankFiles(index, "comp usage").map((e) => e.path)).toEqual([
      "src/components/SidebarUsage.tsx",
    ]);
    expect(rankFiles(index, "docs usage")).toEqual([]);
  });

  it("orders folders after files within a rank and respects the limit", () => {
    const paths = rankFiles(index, "components").map((e) => e.path);
    expect(paths[0]).toBe("src/components");
    expect(rankFiles(index, "s", 2)).toHaveLength(2);
  });

  it("is case-insensitive", () => {
    expect(rankFiles(index, "readme")[0].path).toBe("README.md");
  });
});
