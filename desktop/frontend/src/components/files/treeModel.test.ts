import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  childPath,
  flattenTree,
  foldersTouchedBy,
  parentPath,
  sameEntries,
  sortEntries,
  type Listing,
} from "./treeModel";

const ready = (entries: { name: string; isDir: boolean }[]): Listing => ({
  status: "ready",
  entries,
});

describe("path helpers", () => {
  it("joins and splits project-relative paths", () => {
    expect(childPath("", "src")).toBe("src");
    expect(childPath("src", "a.ts")).toBe("src/a.ts");
    expect(parentPath("src/a/b.ts")).toBe("src/a");
    expect(parentPath("src")).toBe("");
    expect(ancestorsOf("a/b/c.ts")).toEqual(["a", "a/b"]);
    expect(ancestorsOf("top.ts")).toEqual([]);
  });

  it("names the folder a change lands in and that folder's parent", () => {
    expect(foldersTouchedBy("a/b/c.ts")).toEqual(["a/b", "a"]);
    expect(foldersTouchedBy("a/b")).toEqual(["a", ""]);
    expect(foldersTouchedBy("top.ts")).toEqual([""]);
  });
});

describe("sortEntries", () => {
  it("puts folders first and orders names naturally, case-insensitively", () => {
    const sorted = sortEntries([
      { name: "file10.ts", isDir: false },
      { name: "Zeta", isDir: true },
      { name: "file2.ts", isDir: false },
      { name: "alpha", isDir: true },
      { name: "README.md", isDir: false },
      { name: ".env", isDir: false },
    ]).map((e) => e.name);
    expect(sorted).toEqual(["alpha", "Zeta", ".env", "file2.ts", "file10.ts", "README.md"]);
  });

  it("does not mutate its input", () => {
    const input = [
      { name: "b", isDir: false },
      { name: "a", isDir: false },
    ];
    sortEntries(input);
    expect(input.map((e) => e.name)).toEqual(["b", "a"]);
  });

  it("compares listings by name and kind in order", () => {
    const a = [{ name: "x", isDir: true }, { name: "y", isDir: false }];
    expect(sameEntries(a, [{ name: "x", isDir: true }, { name: "y", isDir: false }])).toBe(true);
    expect(sameEntries(a, [{ name: "x", isDir: false }, { name: "y", isDir: false }])).toBe(false);
    expect(sameEntries(a, a.slice(0, 1))).toBe(false);
  });
});

describe("flattenTree", () => {
  const listings = new Map<string, Listing>([
    ["", ready([{ name: "src", isDir: true }, { name: "vendor", isDir: true }, { name: "a.ts", isDir: false }])],
    ["src", ready([{ name: "lib", isDir: true }, { name: "b.ts", isDir: false }])],
    ["src/lib", { status: "loading" }],
    ["vendor", { status: "error", message: "permission denied" }],
  ]);

  it("shows only the root when nothing is expanded", () => {
    expect(flattenTree(listings, new Set()).map((r) => r.path)).toEqual(["src", "vendor", "a.ts"]);
  });

  it("walks expanded folders depth-first with depths and states", () => {
    const rows = flattenTree(listings, new Set(["src", "src/lib", "vendor"]));
    expect(rows.map((r) => [r.path, r.depth])).toEqual([
      ["src", 0],
      ["src/lib", 1],
      ["src/b.ts", 1],
      ["vendor", 0],
      ["a.ts", 0],
    ]);
    const byPath = new Map(rows.map((r) => [r.path, r]));
    expect(byPath.get("src")).toMatchObject({ expanded: true, loading: false, error: null });
    expect(byPath.get("src/lib")).toMatchObject({ expanded: true, loading: true });
    expect(byPath.get("vendor")).toMatchObject({ expanded: true, error: "permission denied" });
  });

  it("treats an expanded folder with no listing yet as loading", () => {
    const rows = flattenTree(listings, new Set(["src", "src/missing"]));
    expect(rows.find((r) => r.path === "src/lib")?.loading).toBe(false);
    expect(rows.find((r) => r.path === "src/lib")?.expanded).toBe(false);
  });

  it("renders nothing while the root itself is missing", () => {
    expect(flattenTree(new Map(), new Set(["src"]))).toEqual([]);
  });
});
