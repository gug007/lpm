import { describe, expect, it } from "vitest";
import type { IgnoredEntry, Listings } from "./ignoredSyncApi";
import { tickOf, toggle, withEnvFiles } from "./ignoredSelection";
import {
  buildTree,
  indexTree,
  keptSide,
  statusOf,
  suggested,
  totalsOf,
  visibleRows,
  type TreeNode,
  type View,
} from "./ignoredTree";

function e(path: string, digest: string, extra: Partial<IgnoredEntry> = {}): IgnoredEntry {
  return { path, dir: path.endsWith("/"), size: 10, files: 1, mtime: 1000, digest, ...extra };
}

function both(here: IgnoredEntry[], there: IgnoredEntry[], mini: IgnoredEntry[] = []): Listings {
  const listing = (entries: IgnoredEntry[]) => ({ entries, more: 0 });
  return { here: listing(here), there: { studio: listing(there), mini: listing(mini) }, sameRepo: {} };
}

const root = both(
  [e(".env", "old", { mtime: 1 }), e(".env.test", "same"), e("node_modules/", "nm1", { size: 900e6, files: 48000 }), e("CLAUDE.local.md", "mine")],
  [
    e(".env", "new", { mtime: 2 }),
    e(".env.test", "same"),
    e("apps/api/.env", "api"),
    e("certs/", "c"),
    e("node_modules/", "nm2", { size: 880e6, files: 47000 }),
    e("public/uploads/", "u", { files: 3 }),
  ],
);

const uploads = both(
  [],
  [e("public/uploads/a.jpg", "a"), e("public/uploads/b.jpg", "b"), e("public/uploads/avatars/", "av", { files: 1 })],
);

function tree(loaded = {}): TreeNode[] {
  return buildTree(root, loaded, ["studio"]);
}

function node(t: TreeNode[], path: string): TreeNode {
  return indexTree(t).get(path)!;
}

describe("buildTree", () => {
  it("merges both computers and nests entries under the folders git tracks", () => {
    const t = tree();
    expect(t.map((n) => n.path)).toEqual(["apps/", "certs/", "node_modules/", "public/", ".env", ".env.test", "CLAUDE.local.md"]);
    expect(node(t, "apps/").ignored).toBe(false);
    expect(node(t, "apps/api/").children!.map((n) => n.path)).toEqual(["apps/api/.env"]);
    expect(node(t, "public/uploads/").children).toBeNull();
    expect(node(tree({ "public/uploads/": uploads }), "public/uploads/").children!.map((n) => n.name)).toEqual([
      "avatars",
      "a.jpg",
      "b.jpg",
    ]);
  });
});

const view: View = { here: "This Mac", peers: [{ slug: "studio", name: "Studio Mac" }], conflicts: new Map() };

describe("statusOf", () => {
  it("says how each row compares between the two computers", () => {
    const t = tree();
    const label = (path: string, v = view) => statusOf(node(t, path), v);
    expect(label(".env")).toEqual({ label: "Newer on Studio Mac", tone: "amber" });
    expect(label("certs/")).toEqual({ label: "Only on Studio Mac", tone: "green" });
    expect(label("CLAUDE.local.md")).toEqual({ label: "Only on This Mac", tone: "green" });
    expect(label(".env.test")).toEqual({ label: "Same on both", tone: "muted" });
    expect(label("node_modules/")).toEqual({ label: "Different on each", tone: "amber" });
    expect(label(".env", { ...view, conflicts: new Map([[".env", "Studio Mac"]]) })).toEqual({
      label: "Changed on both",
      tone: "red",
    });
    expect(label("apps/").label).toBe("Only on Studio Mac");
  });

  it("compares three computers, saying which one lacks a file or holds the newest", () => {
    const three = both(
      [e(".env", "a", { mtime: 1 }), e("certs/", "c"), e("CLAUDE.local.md", "m")],
      [e(".env", "b", { mtime: 3 }), e("certs/", "c"), e("CLAUDE.local.md", "m"), e("studio.local", "s")],
      [e(".env", "a", { mtime: 1 }), e("CLAUDE.local.md", "m")],
    );
    const t = buildTree(three, {}, ["studio", "mini"]);
    const v: View = { ...view, peers: [...view.peers, { slug: "mini", name: "Mac mini" }] };
    const label = (path: string) => statusOf(node(t, path), v).label;
    expect(label(".env")).toBe("Newer on Studio Mac");
    expect(label("certs/")).toBe("Not on Mac mini");
    expect(label("CLAUDE.local.md")).toBe("Same on all");
    expect(keptSide(node(t, ".env"), "newest")).toBe("studio");
    expect(keptSide(node(t, ".env"), "mini")).toBe("mini");
    expect(keptSide(node(t, "certs/"), "mini")).toBe("here");
    const miniOnly = buildTree(three, {}, ["mini"]);
    expect(indexTree(miniOnly).has("studio.local")).toBe(false);
    expect(Object.keys(node(miniOnly, ".env").there)).toEqual(["mini"]);
  });
});

describe("ticking", () => {
  it("ticks a tracked folder as the ignored entries inside it", () => {
    const t = tree();
    const sel = toggle(node(t, "apps/"), t, new Set());
    expect([...sel]).toEqual(["apps/api/.env"]);
    expect(tickOf(node(t, "apps/"), sel)).toBe("all");
    expect(toggle(node(t, "apps/"), t, sel).size).toBe(0);
  });

  it("keeps a whole folder as one path, and unticking a file inside splits it", () => {
    const t = tree({ "public/uploads/": uploads });
    let sel = toggle(node(t, "public/uploads/"), t, new Set());
    expect([...sel]).toEqual(["public/uploads/"]);
    expect(tickOf(node(t, "public/uploads/a.jpg"), sel)).toBe("all");

    sel = toggle(node(t, "public/uploads/a.jpg"), t, sel);
    expect([...sel].sort()).toEqual(["public/uploads/avatars/", "public/uploads/b.jpg"]);
    expect(tickOf(node(t, "public/uploads/"), sel)).toBe("some");
    expect(tickOf(node(t, "public/"), sel)).toBe("some");

    sel = toggle(node(t, "public/uploads/a.jpg"), t, sel);
    expect([...sel]).toEqual(["public/uploads/"]);
  });

  it("suggests secrets and local config from either computer, never dependencies", () => {
    const t = tree();
    expect([...suggested(t)].sort()).toEqual([".env", ".env.test", "CLAUDE.local.md", "apps/api/.env", "certs/"]);
    expect([...withEnvFiles(t, new Set())].sort()).toEqual([".env", ".env.test", "apps/api/.env"]);
  });

  it("counts what the ticked rows keep in sync and flags dependencies", () => {
    const t = tree();
    const totals = totalsOf(t, new Set([".env", "node_modules/", ".env.test"]), view);
    expect(totals).toMatchObject({ files: 48002, differ: 2, heavy: ["node_modules/"] });
  });
});

describe("visibleRows", () => {
  it("shows opened folders, and with a query everything leading to a match", () => {
    const t = tree({ "public/uploads/": uploads });
    expect(visibleRows(t, new Set(), "").map((r) => r.node.path)).toHaveLength(7);
    const found = visibleRows(t, new Set(), "b.jpg").map((r) => r.node.path);
    expect(found).toEqual(["public/", "public/uploads/", "public/uploads/b.jpg"]);
  });
});
