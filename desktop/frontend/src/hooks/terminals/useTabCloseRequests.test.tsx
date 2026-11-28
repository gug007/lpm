// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  StopTerminal: vi.fn(async (_id: string) => {}),
  ClearPaneStatus: vi.fn(async () => {}),
  HoldPaneStatus: vi.fn(async () => {}),
  ReleasePaneStatus: vi.fn(async () => {}),
  LoadTerminals: vi.fn(async () => ({})),
  SaveTerminals: vi.fn(async () => {}),
  TransformText: vi.fn((..._args: unknown[]) => new Promise<string>(() => {})),
  CancelAIGenerate: vi.fn(async () => true),
}));
const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock("../../../bridge/commands", () => bridge);
vi.mock("../../../bridge/runtime", () => ({ EventsOn: vi.fn(() => () => {}) }));
vi.mock("../../mirror", () => ({ IS_MIRROR_WINDOW: false }));
vi.mock("../../sendLater/closeout", () => ({ onTerminalsClosed: vi.fn() }));
vi.mock("../../components/InteractivePane", () => ({ disposeInteractivePaneSession: vi.fn() }));
vi.mock("../../components/UndoCloseToast", async (actual) => {
  const real = await actual<typeof import("../../components/UndoCloseToast")>();
  toast.show.mockImplementation(real.showUndoCloseToast);
  return { ...real, showUndoCloseToast: toast.show };
});
vi.mock("../../store/app", async () => {
  const { create } = await import("zustand");
  return { useAppStore: create(() => ({ projects: [] as unknown[], refreshProjects: async () => {} })) };
});
vi.mock("../../store/globalAgentStatus", async () => {
  const { create } = await import("zustand");
  return { useGlobalAgentStatus: create(() => ({ entries: [], refresh: async () => {} })) };
});
vi.mock("../../store/sendLater", async () => {
  const { create } = await import("zustand");
  return { useSendLater: create(() => ({ items: [] as unknown[] })) };
});

import { collectPanes, collectTerminals, makePaneLeaf, makeTerminal, type PaneNode } from "../../paneTree";
import { useAppStore } from "../../store/app";
import type { AIPicker } from "../useAIPicker";
import { createInputTab, forgetComposerDraft, noteUnsentElsewhere, saveComposerDraft } from "../../store/composerDrafts";
import { composerRewriteOf, startComposerRewrite } from "../../store/composerRewrites";
import { useSendLater } from "../../store/sendLater";
import { applyTerminalCommandEvent, useTerminalCommands } from "../../store/terminalCommands";
import { closeTabAsked, type CloseTabRequest, type TabFacts } from "../../tabClose/request";
import { STATUS_DONE, STATUS_ERROR, STATUS_RUNNING } from "../../types";
import { useCloseWhenDone } from "./useCloseWhenDone";
import { useTabClose } from "./useTabClose";
import { useTabCloseRequests } from "./useTabCloseRequests";

let root: Root;
const treeRef: { current: PaneNode | null } = { current: null };
const focusedRef: { current: string | null } = { current: "p1" };
const restoreSettled = { current: Promise.resolve() };

const tree = (): PaneNode => ({
  kind: "split",
  direction: "row",
  ratio: 0.5,
  a: makePaneLeaf("p1", [makeTerminal("t1", "Claude"), makeTerminal("t2", "Docs"), makeTerminal("t3", "docs")]),
  b: makePaneLeaf("p2", [{ ...makeTerminal("t4", "Notes"), pinned: true }, makeTerminal("t5", "Server")]),
});

function Harness() {
  const [shown, setTree] = useState<PaneNode | null>(tree);
  treeRef.current = shown;
  const [applyTree] = useState(() => (next: PaneNode | null) => {
    treeRef.current = next;
    setTree(next);
  });
  const [forward] = useState(() => vi.fn());
  const [getPane] = useState(() => () => null);
  const tabs = useTabClose({ projectName: "web", treeRef, focusedRef, applyTree, forward, getPane });
  const waits = useCloseWhenDone({ projectName: "web", tree: shown, treeRef, applyTree, forward, ...tabs });
  useTabCloseRequests({ projectName: "web", treeRef, restoreSettled, ...tabs, ...waits });
  return null;
}

function status(byPane: Record<string, string>) {
  const statusEntries = Object.entries(byPane).map(([paneID, value]) => ({
    key: `claude_code_${paneID}`,
    value,
    priority: 0,
    timestamp: Date.now(),
    paneID,
  }));
  act(() => useAppStore.setState({ projects: [{ name: "web", statusEntries }] } as never));
}

async function close(tab: string, over: Partial<CloseTabRequest> = {}) {
  const facts: Record<string, TabFacts> = over.facts ?? {};
  let answer: Awaited<ReturnType<typeof closeTabAsked>> | undefined;
  await act(async () => {
    answer = await closeTabAsked({ project: "web", tab, own: "", force: false, whenDone: false, ...over, facts });
  });
  return answer!;
}

const ids = () => (treeRef.current ? collectTerminals(treeRef.current).map((t) => t.id) : []);
const marked = () => collectTerminals(treeRef.current!).filter((t) => t.closeWhenDone).map((t) => t.id);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  toast.show.mockClear();
  bridge.StopTerminal.mockClear();
  useAppStore.setState({ projects: [{ name: "web", statusEntries: [] }] } as never);
  useSendLater.setState({ items: [] } as never);
  useTerminalCommands.setState({ byId: {}, atPrompt: {} });
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  forgetComposerDraft("t2");
});

describe("a tab closed for a command", () => {
  it("goes by its id, behind the usual Undo", async () => {
    expect(await close("t1")).toEqual({ ok: true, result: "closed", tab: "t1", name: "Claude" });
    expect(ids()).toEqual(["t2", "t3", "t4", "t5"]);
    expect(toast.show.mock.calls[0][0].title).toBe("Claude closed");
  });

  it("ends for good after its Undo even while the window is hidden, but not while it is shown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    await close("t1");
    await act(async () => void (await vi.advanceTimersByTimeAsync(4_900)));
    expect(bridge.StopTerminal).not.toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    expect(bridge.StopTerminal).toHaveBeenCalledWith("t1");

    await close("t2");
    hidden.mockReturnValue(false);
    await close("t5");
    await act(async () => void (await vi.advanceTimersByTimeAsync(6_000)));
    expect(bridge.StopTerminal).toHaveBeenCalledTimes(1);
    hidden.mockRestore();
    vi.useRealTimers();
  });

  it("stops a refine still running in it once it is closed for good", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const action = { id: "improve", icon: "sparkles", label: "Improve", instruction: "Improve", enabled: true };
    const key = collectTerminals(treeRef.current!).find((t) => t.id === "t1")!.historyKey!;
    startComposerRewrite(key, {
      projectName: "web",
      cwd: "/web",
      ai: { selectedCLI: "claude", selectedModel: "", selectedEffort: "", selectedFast: false } as AIPicker,
      action,
      value: "fix teh bug",
      count: 1,
      promptId: "p1",
      images: {},
    });
    await close("t1");
    expect(composerRewriteOf(key)).not.toBeNull();
    await act(async () => void (await vi.advanceTimersByTimeAsync(5_100)));
    expect(composerRewriteOf(key)).toBeNull();
    expect(bridge.CancelAIGenerate).toHaveBeenCalledWith(bridge.TransformText.mock.calls[0][8]);
    hidden.mockRestore();
    vi.useRealTimers();
  });

  it("goes by its name in any pane, exactly before ignoring case", async () => {
    expect(await close("docs")).toMatchObject({ ok: true, tab: "t3" });
    expect(await close("server")).toMatchObject({ ok: true, tab: "t5" });
    expect(collectPanes(treeRef.current!).map((p) => p.tabs.map((t) => t.id))).toEqual([["t1", "t2"], ["t4"]]);
  });

  it("is left alone when the name fits several, or none", async () => {
    expect(await close("DOCS")).toEqual({
      ok: false,
      result: "ambiguous",
      tabs: [{ tab: "t2", name: "Docs" }, { tab: "t3", name: "docs" }],
    });
    expect(await close("Lint")).toMatchObject({ ok: false, result: "notFound", tabs: { length: 5 } });
    expect(ids()).toHaveLength(5);
  });

  it("is found by the command naming a shell", async () => {
    useTerminalCommands.setState({
      byId: { t5: { running: { command: "go run ./cmd/api", since: 1, named: true } } },
      atPrompt: {},
    });
    expect(await close("go run ./cmd/api", { facts: { t5: { busy: true } } })).toEqual({
      ok: false,
      result: "refused",
      reason: "command",
      detail: "go run ./cmd/api",
      tab: "t5",
      name: "go run ./cmd/api",
    });
    expect(ids()).toContain("t5");
  });

  it("stays while its agent works, is pinned, or is the one asking", async () => {
    expect(await close("Claude", { facts: { t1: { agent: "working" } } })).toMatchObject({ reason: "working", tab: "t1" });
    expect(await close("Notes", { force: true })).toMatchObject({ reason: "pinned" });
    expect(await close("t2", { own: "t2", force: true })).toMatchObject({ reason: "own" });
    expect(ids()).toHaveLength(5);
  });

  it("stays while it holds a message, typed here or on another computer, or one scheduled for it", async () => {
    const draft = { ...createInputTab(), text: "also the 401 page" };
    saveComposerDraft("t2", { tabs: [draft], activeTabId: draft.id, history: [] });
    expect(await close("Docs")).toMatchObject({ reason: "unsent" });
    forgetComposerDraft("t2");

    noteUnsentElsewhere("t2", "mac-a", true);
    expect(await close("Docs")).toMatchObject({ reason: "unsent" });
    noteUnsentElsewhere("t2", "mac-b", false);
    expect(await close("Docs")).toMatchObject({ reason: "unsent" });
    noteUnsentElsewhere("t2", "mac-a", false);

    const { historyKey } = collectTerminals(treeRef.current!).find((t) => t.id === "t2")!;
    useSendLater.setState({ items: [{ projectName: "web", historyKey }] } as never);
    expect(await close("Docs")).toMatchObject({ reason: "scheduled" });
    expect(await close("Docs", { force: true })).toMatchObject({ ok: true });
  });

  it("isn't blamed for an agent's own program", async () => {
    applyTerminalCommandEvent({ id: "t1", command: "claude --resume abc", at: Date.now() });
    expect(await close("t1", { facts: { t1: { busy: false } } })).toMatchObject({ ok: true });
  });

  it("can't be found in a project this window hasn't opened", async () => {
    expect(await closeTabAsked({ project: "api", tab: "t1", own: "", force: false, whenDone: false, facts: {} })).toEqual({
      ok: false,
      result: "notOpen",
      tabs: [],
    });
  });
});

describe("a tab closed once its agent is done", () => {
  it("waits for a turn under way, its own command's included", async () => {
    status({ t1: STATUS_RUNNING });
    expect(await close("t1", { own: "t1", whenDone: true, facts: { t1: { agent: "working" } } })).toEqual({
      ok: true,
      result: "whenDone",
      tab: "t1",
      name: "Claude",
    });
    expect(marked()).toEqual(["t1"]);
    expect(ids()).toContain("t1");
  });

  it("waits for the first turn of an agent that hasn't started, then closes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    expect(await close("t1", { whenDone: true, facts: { t1: { starting: true } } })).toMatchObject({ result: "firstTurn" });
    act(() => void vi.advanceTimersByTime(30_000));
    expect(ids()).toContain("t1");
    expect(marked()).toEqual([]);

    status({ t1: STATUS_RUNNING });
    expect(marked()).toEqual(["t1"]);
    status({ t1: STATUS_DONE });
    await act(async () => void (await vi.advanceTimersByTimeAsync(3_100)));
    expect(ids()).not.toContain("t1");
    vi.useRealTimers();
  });

  it("stays when that first turn fails", async () => {
    await close("t1", { whenDone: true, facts: { t1: { starting: true } } });
    status({ t1: STATUS_ERROR });
    status({ t1: STATUS_RUNNING });
    expect(marked()).toEqual([]);
    expect(ids()).toContain("t1");
  });

  it("closes right away when its agent is already done", async () => {
    expect(await close("t1", { whenDone: true })).toMatchObject({ ok: true, result: "closed" });
    expect(ids()).not.toContain("t1");
  });
});
