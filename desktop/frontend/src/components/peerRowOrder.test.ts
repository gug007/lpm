import { describe, it, expect } from "vitest";
import type { ProjectInfo } from "../types";
import {
  isPeerRowId,
  movePeerRow,
  orderPeerProjects,
  peerRowNameOf,
  peerRowToken,
  prunePeerRowOrder,
} from "./peerRowOrder";

const project = (name: string): ProjectInfo => ({ name, root: `/srv/${name}` }) as ProjectInfo;

const names = (list: ProjectInfo[]) => list.map((p) => p.name);

describe("row tokens", () => {
  it("round-trips a name", () => {
    const id = peerRowToken("peer-1234abcd-api");
    expect(peerRowNameOf(id)).toBe("peer-1234abcd-api");
    expect(isPeerRowId(id)).toBe(true);
  });

  it("does not claim the section's own token", () => {
    expect(peerRowNameOf("peer:1234abcd")).toBeNull();
    expect(isPeerRowId("peer:1234abcd")).toBe(false);
    expect(peerRowNameOf("group:g1")).toBeNull();
    expect(peerRowNameOf("web")).toBeNull();
  });
});

describe("orderPeerProjects", () => {
  const listed = [project("a"), project("b"), project("c")];

  it("keeps the host's order with nothing stored", () => {
    expect(names(orderPeerProjects(listed, undefined))).toEqual(["a", "b", "c"]);
    expect(names(orderPeerProjects(listed, []))).toEqual(["a", "b", "c"]);
  });

  it("applies the stored order", () => {
    expect(names(orderPeerProjects(listed, ["c", "a", "b"]))).toEqual(["c", "a", "b"]);
  });

  it("ignores names the host no longer lists", () => {
    expect(names(orderPeerProjects(listed, ["gone", "c", "a"]))).toEqual(["c", "a", "b"]);
  });

  it("sorts unknown names last, in the host's order", () => {
    expect(names(orderPeerProjects([...listed, project("d")], ["c"]))).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });
});

describe("movePeerRow", () => {
  it("moves down and up", () => {
    expect(movePeerRow(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(movePeerRow(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("returns null for a no-op or an unlisted name", () => {
    expect(movePeerRow(["a", "b"], "a", "a")).toBeNull();
    expect(movePeerRow(["a", "b"], "a", "z")).toBeNull();
    expect(movePeerRow(["a", "b"], "z", "a")).toBeNull();
  });
});

describe("prunePeerRowOrder", () => {
  it("drops unpaired Macs and keeps the rest", () => {
    const order = { aaaa1111: ["a"], bbbb2222: ["b"] };
    expect(prunePeerRowOrder(order, ["aaaa1111"])).toEqual({ aaaa1111: ["a"] });
    expect(prunePeerRowOrder(order, ["aaaa1111", "bbbb2222"])).toEqual(order);
    expect(prunePeerRowOrder({}, ["aaaa1111"])).toEqual({});
  });
});
