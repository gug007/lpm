import { describe, expect, it } from "vitest";
import { makeBrowser, makePaneLeaf, makeTerminal, type PaneNode } from "./paneTree";
import {
  captureLayout,
  layoutOwner,
  mergeOpenTabs,
  normalizeSavedLayouts,
  prepareLayout,
  withDefaultLayout,
  withSavedLayout,
  withoutSavedLayout,
  type SavedLayout,
  type SavedLayoutNode,
} from "./savedLayouts";

const tree: PaneNode = {
  kind: "split",
  direction: "row",
  ratio: 0.6,
  a: makePaneLeaf("p1", [
    makeTerminal("t1", "Claude Code", {
      actionName: "claude",
      startCmd: "claude --session-id 4f1c",
      resumeCmd: "claude --resume 4f1c",
      emoji: "✳",
    }),
    makeBrowser("b1"),
    makeTerminal("t2", "Terminal 3"),
  ], 2),
  b: {
    kind: "split",
    direction: "col",
    ratio: 0.5,
    a: makePaneLeaf("p2", [
      makeTerminal("t3", "Codex", { agentSession: { provider: "codex", sessionId: "abc" }, resumeCmd: "codex resume abc" }),
    ]),
    b: makePaneLeaf("p3", [makeBrowser("b2")]),
  },
};

describe("captureLayout", () => {
  it("keeps the shape and what runs where, never a session", () => {
    expect(captureLayout(tree)).toEqual({
      kind: "split",
      direction: "row",
      ratio: 0.6,
      a: {
        kind: "leaf",
        tabs: [{ label: "Claude Code", actionName: "claude", emoji: "✳" }, { label: "Terminal" }],
        activeTabIdx: 1,
      },
      b: {
        kind: "split",
        direction: "col",
        ratio: 0.5,
        a: { kind: "leaf", tabs: [{ label: "Codex", agent: "codex" }], activeTabIdx: 0 },
        b: { kind: "leaf", tabs: [], activeTabIdx: 0 },
      },
    });
  });

  it("saves a quit agent as the shell it became", () => {
    const leaf = makePaneLeaf("p", [makeTerminal("t", "Claude Code", { resumeCmd: "claude --resume x", agentEnded: true })]);
    expect(captureLayout(leaf)).toEqual({ kind: "leaf", tabs: [{ label: "Claude Code" }], activeTabIdx: 0 });
  });
});

describe("prepareLayout", () => {
  const layout: SavedLayoutNode = {
    kind: "split",
    direction: "row",
    ratio: 0.5,
    a: { kind: "leaf", tabs: [], activeTabIdx: 0 },
    b: { kind: "leaf", tabs: [{ label: "Terminal" }, { label: "Terminal" }], activeTabIdx: 0 },
  };

  it("makes labels unique against open tabs and each other", () => {
    const out = prepareLayout(layout, ["Terminal 1"], true);
    expect(out.kind === "split" && out.b.kind === "leaf" && out.b.tabs.map((t) => t.label)).toEqual([
      "Terminal 2",
      "Terminal 3",
    ]);
    const agents: SavedLayoutNode = {
      kind: "leaf",
      tabs: [{ label: "Claude Code", agent: "claude" }, { label: "Claude Code", agent: "claude" }],
      activeTabIdx: 0,
    };
    const named = prepareLayout(agents, ["Claude Code"], false);
    expect(named.kind === "leaf" && named.tabs.map((t) => t.label)).toEqual(["Claude Code 2", "Claude Code 3"]);
  });

  it("gives an empty pane a shell unless open tabs will fill it", () => {
    const filled = prepareLayout(layout, [], false);
    expect(filled.kind === "split" && filled.a.kind === "leaf" && filled.a.tabs).toEqual([{ label: "Terminal 1" }]);
    const waiting = prepareLayout(layout, [], true);
    expect(waiting.kind === "split" && waiting.a.kind === "leaf" && waiting.a.tabs).toEqual([]);
  });
});

describe("mergeOpenTabs", () => {
  const built: PaneNode = {
    kind: "split",
    direction: "row",
    ratio: 0.5,
    a: makePaneLeaf("n1", [makeTerminal("n-t1", "Claude Code")]),
    b: makePaneLeaf("n2", [makeTerminal("n-t2", "Terminal")]),
  };

  it("is the layout alone when nothing is open", () => {
    expect(mergeOpenTabs(null, built)).toBe(built);
  });

  it("moves every open tab into the first pane, ahead of the layout's", () => {
    const current = makePaneLeaf("old", [makeTerminal("o1", "Terminal"), makeBrowser("ob")], 1);
    current.activeServiceName = "web";
    const merged = mergeOpenTabs(current, built);
    expect(merged.kind === "split" && merged.a.kind === "leaf" && merged.a.tabs.map((t) => t.id)).toEqual([
      "o1",
      "ob",
      "n-t1",
    ]);
    expect(merged.kind === "split" && merged.a.kind === "leaf" && merged.a.activeTabIdx).toBe(2);
    expect(merged.kind === "split" && merged.a.kind === "leaf" && merged.a.activeServiceName).toBeUndefined();
  });

  it("keeps the service log showing when the layout leaves the first pane empty", () => {
    const current = makePaneLeaf("old", []);
    current.activeServiceName = "web";
    const merged = mergeOpenTabs(current, { ...built, a: makePaneLeaf("n1", []) });
    expect(merged.kind === "split" && merged.a.kind === "leaf" && merged.a.activeServiceName).toBe("web");
  });
});

describe("settings helpers", () => {
  const one: SavedLayout = { id: "l1", name: "Agents", root: { kind: "leaf", tabs: [], activeTabIdx: 0 } };

  it("adds, replaces, defaults and removes a project's layouts", () => {
    let config = withSavedLayout(undefined, "web", one);
    expect(config).toEqual({ web: { layouts: [one] } });
    config = withSavedLayout(config, "web", { ...one, name: "Two agents" });
    expect(config?.web.layouts.map((l) => l.name)).toEqual(["Two agents"]);
    config = withDefaultLayout(config, "web", "l1");
    expect(config?.web.defaultId).toBe("l1");
    expect(withoutSavedLayout(config, "web", "l1")).toBeUndefined();
  });

  it("files a copy's layouts under its original", () => {
    expect(layoutOwner({ name: "web-2", parentName: "web" })).toBe("web");
    expect(layoutOwner({ name: "web" })).toBe("web");
  });
});

describe("normalizeSavedLayouts", () => {
  it("drops malformed entries and a default that names no layout", () => {
    expect(
      normalizeSavedLayouts({
        web: {
          defaultId: "gone",
          layouts: [
            { id: "l1", name: "Agents", root: { kind: "leaf", tabs: [{ label: "Codex", agent: "codex" }, { nope: 1 }], activeTabIdx: 4 } },
            { id: "l2", name: "Broken", root: { kind: "split" } },
          ],
        },
        api: { layouts: "no" },
      }),
    ).toEqual({
      web: { layouts: [{ id: "l1", name: "Agents", root: { kind: "leaf", tabs: [{ label: "Codex", agent: "codex" }], activeTabIdx: 0 } }] },
    });
  });

  it("is undefined for nothing usable", () => {
    expect(normalizeSavedLayouts(undefined)).toBeUndefined();
    expect(normalizeSavedLayouts({})).toBeUndefined();
  });
});
