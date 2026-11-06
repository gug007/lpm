// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  CopyClaudeSessionForFork: vi.fn(async () => {}),
  MoveClaudeTabToAccount: vi.fn(async () => ({ moved: true, carriesOn: false })),
  StartTerminal: vi.fn(async () => "pty-2"),
  StartTerminalForRestore: vi.fn(async () => "pty-2"),
  StopTerminal: vi.fn(async () => {}),
  TerminalTabOp: vi.fn(async () => {}),
}));
vi.mock("../../../bridge/commands", () => bridge);
vi.mock("../../components/InteractivePane", () => ({ disposeInteractivePaneSession: vi.fn() }));
const whenClaudeBack = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./claudeBack", () => ({ whenClaudeBack }));
vi.mock("../../mirror", () => ({ IS_MIRROR_WINDOW: false }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("../../notifications/toast", () => ({ toast: { error: toastError } }));

import { collectTerminals, makePaneLeaf, makeTerminal, type PaneNode } from "../../paneTree";
import { settleHostSwap } from "../../peer/hostSwaps";
import { prefixName } from "../../peer/markers";
import { useAccountsStore } from "../../store/accounts";
import { useClaudeSwitches } from "../../store/claudeSwitches";
import { useClaudeAccountSwitch } from "./useClaudeAccountSwitch";

let root: Root;
let switchAccount: (id: string, account: string, label?: string) => Promise<void>;
const treeRef: { current: PaneNode | null } = { current: null };
const applyTree = vi.fn((next: PaneNode | null) => {
  treeRef.current = next;
});
const scheduleCmdInject = vi.fn();
const restartTerminal = vi.fn(async () => {});
const peerTab = prefixName("aaaaaaaa", "pty-9");

function onlyPeerClaudeTab() {
  treeRef.current = makePaneLeaf("p1", [
    makeTerminal(peerTab, "Claude", { resumeCmd: "claude --resume abc", historyKey: "h9" }),
  ]);
}

function Harness() {
  switchAccount = useClaudeAccountSwitch({
    projectName: "web",
    treeRef,
    applyTree,
    scheduleCmdInject,
    forward: vi.fn(),
    restartTerminal,
  });
  return null;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  bridge.MoveClaudeTabToAccount.mockResolvedValue({ moved: true, carriesOn: false });
  useClaudeSwitches.setState({ switches: {} });
  useAccountsStore.setState({ accounts: [{ id: "work", label: "Work" }] });
  treeRef.current = makePaneLeaf("p1", [
    makeTerminal("pty-1", "Claude", {
      startCmd: "claude --session-id abc",
      resumeCmd: "claude --resume abc",
      historyKey: "h1",
    }),
    makeTerminal("pty-3", "Shell"),
  ]);
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useClaudeAccountSwitch", () => {
  it("moves the conversation and continues it on the new account in the same tab", async () => {
    let shownWhileMoving: string | undefined;
    let coveredWhileMoving: unknown;
    bridge.MoveClaudeTabToAccount.mockImplementation(async () => {
      shownWhileMoving = collectTerminals(treeRef.current!)[0].id;
      coveredWhileMoving = useClaudeSwitches.getState().switches.h1?.to;
      return { moved: true, carriesOn: false };
    });
    await switchAccount("pty-1", "work");
    expect(bridge.StartTerminal).toHaveBeenCalledWith("web", undefined, undefined, undefined, "work");
    expect(bridge.MoveClaudeTabToAccount).toHaveBeenCalledWith("web", "pty-1", "abc", "work");
    expect(shownWhileMoving).toBe("pty-2");
    expect(coveredWhileMoving).toBe("Work");
    expect(useClaudeSwitches.getState().switches).toEqual({});
    const [tab] = collectTerminals(treeRef.current!);
    expect(tab).toMatchObject({ id: "pty-2", label: "Claude", historyKey: "h1" });
    expect(scheduleCmdInject).toHaveBeenCalledWith("pty-2", "claude --resume abc", undefined);
  });

  it("carries on a turn cut short by the move or by its account's limit", async () => {
    bridge.MoveClaudeTabToAccount.mockResolvedValue({ moved: true, carriesOn: true });
    await switchAccount("pty-1", "work");
    expect(scheduleCmdInject).toHaveBeenCalledWith(
      "pty-2",
      "claude --resume abc 'Continue where you left off.'",
      undefined,
    );
    expect(whenClaudeBack).toHaveBeenCalledWith("web", "pty-2", "working");
  });

  it("starts the session afresh when nothing was saved yet", async () => {
    bridge.MoveClaudeTabToAccount.mockResolvedValue({ moved: false, carriesOn: false });
    await switchAccount("pty-1", "work");
    expect(scheduleCmdInject).toHaveBeenCalledWith("pty-2", "claude --session-id abc", undefined);
  });

  it("starts an unsaved fork over as the same fork, its source copied to the new account first", async () => {
    const fork = "claude --resume abc --permission-mode auto --fork-session --session-id f1";
    treeRef.current = makePaneLeaf("p1", [
      makeTerminal("pty-1", "Claude · fork", { startCmd: fork, resumeCmd: "claude --resume f1 --permission-mode auto" }),
    ]);
    bridge.MoveClaudeTabToAccount.mockResolvedValue({ moved: false, carriesOn: false });
    await switchAccount("pty-1", "work");
    expect(bridge.MoveClaudeTabToAccount).toHaveBeenCalledWith("web", "pty-1", "f1", "work");
    expect(bridge.CopyClaudeSessionForFork).toHaveBeenCalledWith("web", "web", "abc", "work");
    expect(scheduleCmdInject).toHaveBeenCalledWith("pty-2", fork, undefined);
    expect(bridge.CopyClaudeSessionForFork.mock.invocationCallOrder[0]).toBeLessThan(
      scheduleCmdInject.mock.invocationCallOrder[0],
    );
  });

  it("resumes a fork that has saved, with nothing copied", async () => {
    treeRef.current = makePaneLeaf("p1", [
      makeTerminal("pty-1", "Claude · fork", {
        startCmd: "claude --resume abc --fork-session --session-id f1",
        resumeCmd: "claude --resume f1",
      }),
    ]);
    await switchAccount("pty-1", "work");
    expect(bridge.CopyClaudeSessionForFork).not.toHaveBeenCalled();
    expect(scheduleCmdInject).toHaveBeenCalledWith("pty-2", "claude --resume f1", undefined);
  });

  it("starts nothing when a fork's source can't reach the new account", async () => {
    treeRef.current = makePaneLeaf("p1", [
      makeTerminal("pty-1", "Claude · fork", {
        startCmd: "claude --resume abc --fork-session --session-id f1",
        resumeCmd: "claude --resume f1",
      }),
    ]);
    bridge.MoveClaudeTabToAccount.mockResolvedValue({ moved: false, carriesOn: false });
    bridge.CopyClaudeSessionForFork.mockRejectedValueOnce("disk full");
    await switchAccount("pty-1", "work");
    expect(toastError).toHaveBeenCalledWith("Couldn't switch the Claude account: disk full");
    expect(scheduleCmdInject).not.toHaveBeenCalled();
  });

  it("continues the conversation on its own account when the move fails", async () => {
    bridge.MoveClaudeTabToAccount.mockRejectedValue("disk full");
    await switchAccount("pty-1", "work");
    expect(toastError).toHaveBeenCalledWith("Couldn't switch the Claude account: disk full");
    expect(bridge.StopTerminal).toHaveBeenCalledWith("pty-1");
    expect(bridge.StopTerminal).toHaveBeenCalledWith("pty-2");
    expect(restartTerminal).toHaveBeenCalledWith("pty-2");
    expect(scheduleCmdInject).not.toHaveBeenCalled();
    expect(useClaudeSwitches.getState().switches).toEqual({});
  });

  it("leaves the tab running when the account can't start a terminal", async () => {
    bridge.StartTerminal.mockRejectedValueOnce("unknown Claude account: work");
    await switchAccount("pty-1", "work");
    expect(toastError).toHaveBeenCalledWith("Couldn't switch the Claude account: unknown Claude account: work");
    expect(bridge.MoveClaudeTabToAccount).not.toHaveBeenCalled();
    expect(applyTree).not.toHaveBeenCalled();
  });

  it("leaves a tab without Claude alone", async () => {
    await switchAccount("pty-3", "work");
    expect(bridge.MoveClaudeTabToAccount).not.toHaveBeenCalled();
    expect(applyTree).not.toHaveBeenCalled();
  });

  it("asks a paired machine to move its own tab, covered until the new terminal is back", async () => {
    onlyPeerClaudeTab();
    const done = switchAccount(peerTab, "work", "Their work");
    await act(async () => {});
    expect(bridge.TerminalTabOp).toHaveBeenCalledWith("web", "account", peerTab, null, null, null, "work");
    expect(useClaudeSwitches.getState().switches).toEqual({ h9: { to: "Their work", from: peerTab } });

    const moved = prefixName("aaaaaaaa", "pty-10");
    settleHostSwap(peerTab, moved);
    await done;
    expect(whenClaudeBack).toHaveBeenCalledWith("web", moved, "either");
    expect(useClaudeSwitches.getState().switches).toEqual({});
    expect(bridge.MoveClaudeTabToAccount).not.toHaveBeenCalled();
  });

  it("uncovers a paired tab whose machine refuses the move", async () => {
    onlyPeerClaudeTab();
    bridge.TerminalTabOp.mockRejectedValueOnce('unknown tab op "account"');
    await switchAccount(peerTab, "work");
    expect(toastError).toHaveBeenCalledWith(
      "Couldn't switch the Claude account: update lpm on that machine to switch its tabs' accounts from here",
    );
    expect(useClaudeSwitches.getState().switches).toEqual({});
  });
});
