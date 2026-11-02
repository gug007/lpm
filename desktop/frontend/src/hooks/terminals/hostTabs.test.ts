import { describe, it, expect } from "vitest";
import { followHostTabs, withHostTabs, withReplacedHostTabs, withoutHostTabs } from "./hostTabs";
import { type PaneLeaf, type PaneNode, makePaneLeaf, makeTerminal } from "../../paneTree";

const leaf = (node: PaneNode) => node as PaneLeaf;

describe("withHostTabs", () => {
  it("opens an empty project on the host's tabs", () => {
    const { tree, focus } = withHostTabs(null, null, [
      { id: "peer-aaaaaaaa-lpm-1", label: "Claude Code", pinned: false },
      { id: "peer-aaaaaaaa-lpm-2", pinned: true },
    ]);
    const pane = leaf(tree);
    expect(focus).toBe(pane.id);
    expect(pane.activeTabIdx).toBe(0);
    expect(pane.tabs.map((t) => [t.id, t.label, !!t.pinned])).toEqual([
      ["peer-aaaaaaaa-lpm-1", "Claude Code", false],
      ["peer-aaaaaaaa-lpm-2", "Terminal 1", true],
    ]);
    expect(pane.tabs.every((t) => t.fromHost)).toBe(true);
  });

  it("adds behind the tab in view of the focused pane", () => {
    const left = makePaneLeaf("left", [makeTerminal("a", "Claude Code")]);
    const right = makePaneLeaf("right", [makeTerminal("b", "Terminal 1")]);
    const start: PaneNode = { kind: "split", direction: "row", ratio: 0.5, a: left, b: right };
    const { tree, focus } = withHostTabs(start, "right", [
      { id: "peer-aaaaaaaa-lpm-3", label: "Claude Code", pinned: false },
      { id: "peer-aaaaaaaa-lpm-4", pinned: false },
    ]);
    expect(focus).toBeUndefined();
    const split = tree as Extract<PaneNode, { kind: "split" }>;
    expect(split.a).toBe(left);
    const pane = leaf(split.b);
    expect(pane.activeTabIdx).toBe(0);
    expect(pane.tabs.map((t) => t.label)).toEqual(["Terminal 1", "Claude Code 2", "Terminal 2"]);
  });

  // The tab opens here after its agent reported the conversation, so it never
  // hears that event: the host's listing is what makes it an agent tab.
  it("opens an agent tab on the conversation the host names", () => {
    const { tree } = withHostTabs(null, null, [
      {
        id: "peer-aaaaaaaa-lpm-5",
        label: "Claude",
        pinned: false,
        agentSession: { provider: "claude", sessionId: "c-1" },
      },
      {
        id: "peer-aaaaaaaa-lpm-6",
        label: "Codex",
        pinned: false,
        agentSession: { provider: "codex", sessionId: "x-1" },
      },
    ]);
    expect(leaf(tree).tabs.map((t) => [t.agentSession?.sessionId, t.resumeCmd])).toEqual([
      ["c-1", "claude --resume c-1"],
      ["x-1", "codex resume x-1"],
    ]);
  });

  it("falls back to the first pane when focus points nowhere", () => {
    const only = makePaneLeaf("only", [makeTerminal("a", "Terminal 1")]);
    const { tree } = withHostTabs(only, "gone", [{ id: "peer-aaaaaaaa-lpm-5", pinned: false }]);
    expect(leaf(tree).tabs.map((t) => t.id)).toEqual(["a", "peer-aaaaaaaa-lpm-5"]);
  });
});

describe("withoutHostTabs", () => {
  const split = (a: PaneNode, b: PaneNode): PaneNode => ({ kind: "split", direction: "row", ratio: 0.5, a, b });

  it("keeps the tab in view when another one closes", () => {
    const pane = makePaneLeaf("p", [makeTerminal("a", "1"), makeTerminal("b", "2"), makeTerminal("c", "3")], 2);
    const { tree, focus } = withoutHostTabs(pane, "p", new Set(["a"]));
    expect(focus).toBeUndefined();
    expect(leaf(tree!).tabs.map((t) => t.id)).toEqual(["b", "c"]);
    expect(leaf(tree!).activeTabIdx).toBe(1);
  });

  it("shows the next tab when the one in view closes", () => {
    const pane = makePaneLeaf("p", [makeTerminal("a", "1"), makeTerminal("b", "2"), makeTerminal("c", "3")], 1);
    const { tree } = withoutHostTabs(pane, "p", new Set(["b"]));
    expect(leaf(tree!).tabs.map((t) => t.id)).toEqual(["a", "c"]);
    expect(leaf(tree!).activeTabIdx).toBe(1);
  });

  it("collapses a pane left empty and moves focus off it", () => {
    const left = makePaneLeaf("left", [makeTerminal("a", "1")]);
    const right = makePaneLeaf("right", [makeTerminal("b", "2"), makeTerminal("c", "3")]);
    const { tree, focus } = withoutHostTabs(split(left, right), "right", new Set(["b", "c"]));
    expect(leaf(tree!).id).toBe("left");
    expect(focus).toBe("left");
  });

  it("closes every pane when every tab closed", () => {
    const left = makePaneLeaf("left", [makeTerminal("a", "1")]);
    const right = makePaneLeaf("right", [makeTerminal("b", "2")]);
    expect(withoutHostTabs(split(left, right), "left", new Set(["a", "b"]))).toEqual({ tree: null, focus: null });
  });

  it("keeps a pane that still shows a service", () => {
    const pane: PaneLeaf = { ...makePaneLeaf("p", [makeTerminal("a", "1")]), activeServiceName: "web" };
    const { tree } = withoutHostTabs(pane, "p", new Set(["a"]));
    expect(leaf(tree!).tabs).toEqual([]);
  });
});

describe("followHostTabs", () => {
  const a = "peer-aaaaaaaa-lpm-1";
  const b = "peer-aaaaaaaa-lpm-2";
  const c = "peer-aaaaaaaa-lpm-3";

  it("takes the host's names, pins and icons", () => {
    const start = makePaneLeaf("p", [makeTerminal(a, "Terminal 1"), makeTerminal(b, "Terminal 2")]);
    const pane = leaf(
      followHostTabs(start, [
        { id: a, label: "server", pinned: true, emoji: "🚀" },
        { id: b, pinned: false },
      ], [a, b]),
    );
    expect(pane.tabs.map((t) => [t.label, !!t.pinned, t.emoji])).toEqual([
      ["server", true, "🚀"],
      ["Terminal 2", false, undefined],
    ]);
    expect(pane.tabs[0].sessionTitleSource).toBe("manual");
  });

  it("puts the host's tabs in its order, keeping the tab in view", () => {
    const start = makePaneLeaf("p", [makeTerminal(a, "A"), makeTerminal(b, "B"), makeTerminal(c, "C")], 1);
    const pane = leaf(
      followHostTabs(start, [
        { id: c, label: "C", pinned: false },
        { id: a, label: "A", pinned: false },
        { id: b, label: "B", pinned: false },
      ], [c, a, b]),
    );
    expect(pane.tabs.map((t) => t.id)).toEqual([c, a, b]);
    expect(pane.tabs[pane.activeTabIdx].id).toBe(b);
  });

  it("orders each pane on its own and leaves tabs the host doesn't list alone", () => {
    const left = makePaneLeaf("l", [makeTerminal(b, "B"), makeTerminal("local", "Mine"), makeTerminal(a, "A")]);
    const right = makePaneLeaf("r", [makeTerminal(c, "C")]);
    const start: PaneNode = { kind: "split", direction: "row", ratio: 0.5, a: left, b: right };
    const host = [a, b, c].map((id) => ({ id, label: id === a ? "A" : id === b ? "B" : "C", pinned: false }));
    const next = followHostTabs(start, host, [a, b, c]) as Extract<PaneNode, { kind: "split" }>;
    expect(leaf(next.a).tabs.map((t) => t.id)).toEqual([a, "local", b]);
    expect(leaf(next.b).tabs.map((t) => t.id)).toEqual([c]);
  });

  it("hands back the same tree when nothing differs", () => {
    const start = makePaneLeaf("p", [makeTerminal(a, "A")]);
    expect(followHostTabs(start, [{ id: a, label: "A", pinned: false }], [a])).toBe(start);
  });

  it("gives a tab with no conversation the one the host names", () => {
    const start = makePaneLeaf("p", [makeTerminal(a, "Claude", { fromHost: true })]);
    const session = { provider: "claude" as const, sessionId: "c-2" };
    const pane = leaf(followHostTabs(start, [{ id: a, label: "Claude", pinned: false, agentSession: session }], [a]));
    expect(pane.tabs[0].agentSession).toEqual(session);
    expect(pane.tabs[0].resumeCmd).toBe("claude --resume c-2");
  });

  // The agent's own report can be ahead of the host's listing.
  it("keeps the conversation a tab already follows", () => {
    const start = makePaneLeaf("p", [
      makeTerminal(a, "Claude", {
        agentSession: { provider: "claude", sessionId: "new" },
        resumeCmd: "claude --resume new",
      }),
    ]);
    const host = [
      { id: a, label: "Claude", pinned: false, agentSession: { provider: "claude" as const, sessionId: "old" } },
    ];
    expect(followHostTabs(start, host, [a])).toBe(start);
  });
});

describe("withReplacedHostTabs", () => {
  const peer = (n: number) => `peer-aaaaaaaa-lpm-${n}`;
  const session = { provider: "claude" as const, sessionId: "abc" };
  const moved = { id: peer(9), pinned: false, agentSession: session };
  const start = () =>
    makePaneLeaf(
      "p",
      [
        makeTerminal(peer(1), "Shell"),
        { ...makeTerminal(peer(2), "Claude", { resumeCmd: "claude --resume abc", historyKey: "h2" }), fromHost: true },
        makeTerminal(peer(3), "Shell"),
      ],
      1,
    );

  it("puts the host's new terminal in the place of the tab it moved", () => {
    const { tree, replaced } = withReplacedHostTabs(start(), [moved], [peer(1), peer(9), peer(3)]);
    const pane = leaf(tree);
    expect(replaced).toEqual([{ from: peer(2), to: peer(9) }]);
    expect(pane.tabs.map((t) => t.id)).toEqual([peer(1), peer(9), peer(3)]);
    expect(pane.activeTabIdx).toBe(1);
    expect(pane.tabs[1]).toMatchObject({ label: "Claude", historyKey: "h2", fromHost: true });
  });

  it("leaves a tab the host still lists, and hosts that don't list their tabs", () => {
    expect(withReplacedHostTabs(start(), [moved], [peer(1), peer(2), peer(3), peer(9)]).replaced).toEqual([]);
    expect(withReplacedHostTabs(start(), [moved], null).replaced).toEqual([]);
  });

  it("matches only the same conversation", () => {
    const other = { ...moved, agentSession: { provider: "claude" as const, sessionId: "xyz" } };
    expect(withReplacedHostTabs(start(), [other, { ...moved, agentSession: undefined }], []).replaced).toEqual([]);
  });
});
