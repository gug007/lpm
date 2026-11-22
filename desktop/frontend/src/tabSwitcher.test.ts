import { describe, expect, it } from "vitest";
import { buildTabSwitchList, cycleIndex, firstIndex } from "./tabSwitcher";
import { GLOBAL_TERMINALS_KEY } from "./terminals";

const visit = (project: string, key: string, label = key) => ({ project, key, label });
const tab = (id: string, historyKey: string, label = historyKey) => ({ id, historyKey, label, emoji: "" });

describe("buildTabSwitchList", () => {
  it("keeps the order the tabs were visited in, across projects, computers and Terminals", () => {
    const visits = [
      visit("bowen", "k1"),
      visit("peer-abcd1234-server", "k2"),
      visit(GLOBAL_TERMINALS_KEY, "k3"),
      visit("api", "k4"),
    ];
    const names = new Set(["bowen", "peer-abcd1234-server", "api"]);
    expect(buildTabSwitchList(visits, names, {}).map((v) => v.key)).toEqual(["k1", "k2", "k3", "k4"]);
  });

  it("never offers a project that wasn't visited", () => {
    const list = buildTabSwitchList([visit("bowen", "k1")], new Set(["bowen", "notes", "lpm"]), {});
    expect(list.map((v) => v.project)).toEqual(["bowen"]);
  });

  it("skips a computer that isn't connected and a removed project", () => {
    const visits = [visit("peer-abcd1234-server", "k1"), visit("gone", "k2"), visit("bowen", "k3")];
    expect(buildTabSwitchList(visits, new Set(["bowen"]), {}).map((v) => v.key)).toEqual(["k3"]);
  });

  it("drops a closed tab of an open project, keeps tabs of one not opened yet, and uses live names", () => {
    const visits = [visit("bowen", "gone"), visit("bowen", "k2", "old name"), visit("api", "k3")];
    const targets = { bowen: [tab("t-2", "k2", "Fix login")] };
    const list = buildTabSwitchList(visits, new Set(["bowen", "api"]), targets);
    expect(list).toEqual([visit("bowen", "k2", "Fix login"), visit("api", "k3")]);
  });
});

describe("firstIndex", () => {
  it("a quick press from the tab on screen goes back to the one before", () => {
    expect(firstIndex(4, true, 1)).toBe(1);
  });

  it("from somewhere that isn't a tab it goes to the last tab", () => {
    expect(firstIndex(4, false, 1)).toBe(0);
  });

  it("shift starts at the oldest", () => {
    expect(firstIndex(4, true, -1)).toBe(3);
  });
});

describe("cycleIndex", () => {
  it("wraps both ways", () => {
    expect(cycleIndex(3, 2, 1)).toBe(0);
    expect(cycleIndex(3, 0, -1)).toBe(2);
    expect(cycleIndex(0, 0, 1)).toBe(0);
  });
});
