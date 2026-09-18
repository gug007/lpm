import { describe, it, expect } from "vitest";

import { ALL_SERVICES, type PaneLeaf, type TerminalInstance } from "../../paneTree";
import { resolveUtilityTabAction, type UtilityReturn } from "./utilityTabToggle";

function tab(id: string, kind?: TerminalInstance["kind"]): TerminalInstance {
  return { id, label: id, ...(kind ? { kind } : {}) };
}

function pane(tabs: TerminalInstance[], activeTabIdx: number, activeServiceName?: string): PaneLeaf {
  return { kind: "leaf", id: "pane1", tabs, activeTabIdx, ...(activeServiceName ? { activeServiceName } : {}) };
}

describe("resolveUtilityTabAction", () => {
  it("opens and remembers the tab it was pressed from", () => {
    const p = pane([tab("t1"), tab("t2"), tab("t3")], 0);
    expect(resolveUtilityTabAction(p, "files", null, [])).toEqual({
      action: "open",
      remember: { kind: "tab", id: "t1" },
    });
  });

  it("returns to the remembered tab when closing, not the neighbour", () => {
    const p = pane([tab("t1"), tab("t2"), tab("t3"), tab("f1", "files")], 3);
    expect(resolveUtilityTabAction(p, "files", { kind: "tab", id: "t1" }, [])).toEqual({
      action: "close",
      tabIdx: 3,
      back: { kind: "tab", id: "t1" },
    });
  });

  it("re-opens (and re-remembers) when the files tab exists but isn't showing", () => {
    const p = pane([tab("t1"), tab("t2"), tab("f1", "files")], 1);
    expect(resolveUtilityTabAction(p, "files", { kind: "tab", id: "t1" }, [])).toEqual({
      action: "open",
      remember: { kind: "tab", id: "t2" },
    });
  });

  it("treats a service log as the pressed-from entry", () => {
    const p = pane([tab("t1")], 0, "web");
    expect(resolveUtilityTabAction(p, "files", null, ["web"])).toEqual({
      action: "open",
      remember: { kind: "service", name: "web" },
    });
  });

  it("returns to a service log that still exists", () => {
    const p = pane([tab("t1"), tab("f1", "files")], 1);
    const back: UtilityReturn = { kind: "service", name: "web" };
    expect(resolveUtilityTabAction(p, "files", back, ["web", "api"])).toEqual({
      action: "close",
      tabIdx: 1,
      back,
    });
    expect(resolveUtilityTabAction(p, "files", back, ["api"])).toEqual({
      action: "close",
      tabIdx: 1,
      back: null,
    });
  });

  it("keeps the All-services aggregate only while more than one service runs", () => {
    const p = pane([tab("t1"), tab("f1", "files")], 1);
    const back: UtilityReturn = { kind: "service", name: ALL_SERVICES };
    expect(resolveUtilityTabAction(p, "files", back, ["web", "api"]).action).toBe("close");
    expect(resolveUtilityTabAction(p, "files", back, ["web", "api"])).toMatchObject({ back });
    expect(resolveUtilityTabAction(p, "files", back, ["web"])).toMatchObject({ back: null });
  });

  it("drops a remembered tab that has since been closed", () => {
    const p = pane([tab("t2"), tab("f1", "files")], 1);
    expect(resolveUtilityTabAction(p, "files", { kind: "tab", id: "t1" }, [])).toEqual({
      action: "close",
      tabIdx: 1,
      back: null,
    });
  });

  it("never remembers the utility tab itself", () => {
    const p = pane([tab("t1"), tab("m1", "memory")], 1);
    expect(resolveUtilityTabAction(p, "files", null, [])).toEqual({
      action: "open",
      remember: { kind: "tab", id: "m1" },
    });
    expect(resolveUtilityTabAction(p, "memory", null, [])).toEqual({
      action: "close",
      tabIdx: 1,
      back: null,
    });
  });

  it("tracks files and memory independently", () => {
    const p = pane([tab("t1"), tab("f1", "files"), tab("m1", "memory")], 2);
    expect(resolveUtilityTabAction(p, "files", { kind: "tab", id: "t1" }, [])).toEqual({
      action: "open",
      remember: { kind: "tab", id: "m1" },
    });
    expect(resolveUtilityTabAction(p, "memory", { kind: "tab", id: "t1" }, [])).toEqual({
      action: "close",
      tabIdx: 2,
      back: { kind: "tab", id: "t1" },
    });
  });
});

describe("resolveUtilityTabAction with views", () => {
  const onChanges = (t: TerminalInstance) => t.id === "changes";

  it("switches a tab showing the other view instead of closing it", () => {
    const p = pane([tab("t1"), tab("tree", "files")], 1);
    expect(resolveUtilityTabAction(p, "files", { kind: "tab", id: "t1" }, [], onChanges)).toEqual({
      action: "open",
      remember: { kind: "tab", id: "t1" },
    });
  });

  it("closes from the view the press names", () => {
    const p = pane([tab("t1"), tab("changes", "files")], 1);
    expect(resolveUtilityTabAction(p, "files", { kind: "tab", id: "t1" }, [], onChanges)).toEqual({
      action: "close",
      tabIdx: 1,
      back: { kind: "tab", id: "t1" },
    });
  });
});
