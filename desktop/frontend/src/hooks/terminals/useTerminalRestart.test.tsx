// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  StartTerminal: vi.fn(async () => "pty-2"),
  StartTerminalForRestore: vi.fn(async () => "pty-2"),
  StopTerminal: vi.fn(async () => {}),
  TerminalExists: vi.fn(async () => false),
  TerminalTabOp: vi.fn(async () => {}),
}));
vi.mock("../../../bridge/commands", () => bridge);
vi.mock("../../components/InteractivePane", () => ({ disposeInteractivePaneSession: vi.fn() }));

import { collectTerminals, makePaneLeaf, makeTerminal, type PaneNode } from "../../paneTree";
import { prefixName } from "../../peer/markers";
import { useTerminalRestart } from "./useTerminalRestart";

let root: Root;
let restart: (id: string) => Promise<void>;
const treeRef: { current: PaneNode | null } = { current: null };
const applyTree = vi.fn((next: PaneNode | null) => {
  treeRef.current = next;
});
const scheduleCmdInject = vi.fn();

function Harness() {
  restart = useTerminalRestart({ projectName: "web", treeRef, applyTree, scheduleCmdInject });
  return null;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.values(bridge).forEach((fn) => fn.mockClear());
  applyTree.mockClear();
  scheduleCmdInject.mockClear();
  bridge.TerminalExists.mockResolvedValue(false);
  treeRef.current = makePaneLeaf("p1", [
    makeTerminal("pty-1", "Claude", { resumeCmd: "claude --resume abc", historyKey: "h1" }),
  ]);
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useTerminalRestart", () => {
  it("runs an ended terminal again in its own tab, resuming its session", async () => {
    await restart("pty-1");
    const [tab] = collectTerminals(treeRef.current!);
    expect(tab).toMatchObject({ id: "pty-2", label: "Claude", historyKey: "h1" });
    expect(scheduleCmdInject).toHaveBeenCalledWith("pty-2", "claude --resume abc");
  });

  it("starts a Claude tab on the account holding its conversation", async () => {
    await restart("pty-1");
    expect(bridge.StartTerminal).toHaveBeenCalledWith("web", "abc");
  });

  it("leaves a terminal that is still running alone", async () => {
    bridge.TerminalExists.mockResolvedValue(true);
    await restart("pty-1");
    expect(bridge.StartTerminal).not.toHaveBeenCalled();
    expect(applyTree).not.toHaveBeenCalled();
  });

  it("asks a paired machine to restart its own tab", async () => {
    const id = prefixName("aaaaaaaa", "pty-9");
    await restart(id);
    expect(bridge.TerminalTabOp).toHaveBeenCalledWith("web", "restart", id, null, null, null);
    expect(bridge.StartTerminal).not.toHaveBeenCalled();
  });
});
