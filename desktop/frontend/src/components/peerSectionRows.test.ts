import { describe, expect, it } from "vitest";
import { peerSectionRows } from "./peerSectionRows";
import { peerRowToken } from "./peerRowOrder";
import { prefixName, prefixRoot } from "../peer/markers";
import type { PendingDuplicate, ProjectInfo } from "../types";

const SLUG = "aaaaaaaa";
const name = (raw: string) => prefixName(SLUG, raw);

function remote(raw: string, parent?: string): ProjectInfo {
  return {
    name: name(raw),
    session: "",
    root: prefixRoot(SLUG, `/Users/other/${raw}`),
    label: raw,
    parentName: parent ? name(parent) : undefined,
    running: false,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries: [],
    isRemote: false,
  };
}

const shape = (rows: ReturnType<typeof peerSectionRows>["rows"]) =>
  rows.map((row) =>
    row.kind === "project"
      ? row.project.label
      : `[${row.children.map((c) => c.label).join(",")}${row.pending.length ? ` +${row.pending.length}` : ""}${row.collapsed ? " folded" : ""}]`,
  );

describe("peerSectionRows", () => {
  it("nests a Mac's copies under their parent, in the order the section keeps", () => {
    const { rows, ids, decks } = peerSectionRows(
      [remote("api"), remote("lpm-3", "lpm"), remote("lpm"), remote("lpm-2", "lpm")],
      [],
      new Set(),
    );

    expect(shape(rows)).toEqual(["api", "lpm", "[lpm-3,lpm-2]"]);
    expect(ids).toEqual(["api", "lpm", "lpm-3", "lpm-2"].map((raw) => peerRowToken(name(raw))));
    expect(decks.get(name("lpm"))?.map((c) => c.label)).toEqual(["lpm-3", "lpm-2"]);
  });

  it("keeps a copy whose parent isn't listed as a row of its own", () => {
    const { rows } = peerSectionRows([remote("lpm-2", "lpm")], [], new Set());
    expect(shape(rows)).toEqual(["lpm-2"]);
  });

  it("hides a folded deck's copies from dragging but keeps them for its rollup", () => {
    const { rows, ids, decks } = peerSectionRows(
      [remote("lpm"), remote("lpm-2", "lpm")],
      [],
      new Set([name("lpm")]),
    );

    expect(shape(rows)).toEqual(["lpm", "[lpm-2 folded]"]);
    expect(ids).toEqual([peerRowToken(name("lpm"))]);
    expect(decks.get(name("lpm"))).toHaveLength(1);
  });

  it("deals a copy on its way under its parent, even before the parent has a deck", () => {
    const pending: PendingDuplicate[] = [
      { id: 1, parent: name("api"), label: "", worktree: false },
      { id: 2, parent: "local-project", label: "", worktree: false },
    ];
    const { rows } = peerSectionRows([remote("api")], pending, new Set([name("api")]));

    // Nothing to fold yet, so a stale collapse can't hide the skeleton.
    expect(shape(rows)).toEqual(["api", "[ +1]"]);
  });
});
