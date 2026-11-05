// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  CopyClaudeSessionForFork: vi.fn(),
  StartTerminal: vi.fn(),
  StartTerminalForConfig: vi.fn(),
  StartTerminalForRestore: vi.fn(),
  StartTerminalWithCwdEnv: vi.fn(),
  StopTerminal: vi.fn(async () => {}),
}));
vi.mock("../../../bridge/commands", () => bridge);
vi.mock("../../mirror", () => ({ IS_MIRROR_WINDOW: false }));
vi.mock("../../components/InteractivePane", () => ({ isInteractivePaneSessionDead: () => false }));
vi.mock("../../terminal-io", () => ({ sendTerminalInput: vi.fn(), shellQuote: (s: string) => s }));
vi.mock("../../diagnostics", () => ({ logDiagnostic: vi.fn() }));
vi.mock("../../notifications/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("../../store/app", () => ({ useAppStore: { getState: () => ({}) } }));
vi.mock("../../store/terminalCommands", () => ({
  useTerminalCommands: { getState: () => ({ byId: {} }) },
}));
vi.mock("../../peer/openedByOtherMac", () => ({ noteOpenedByOtherMac: vi.fn() }));
vi.mock("../../terminals", () => ({
  getProjectTerminals: () => ({}),
  removeHistoryEntry: vi.fn(),
  saveProjectTerminals: vi.fn(),
  updateProjectTerminalsCache: vi.fn(),
}));

import { collectTerminals, makePaneLeaf, makeTerminal } from "../../paneTree";
import { useTabCreation } from "./useTabCreation";
import { useTreeCore } from "./useTreeCore";

let root: Root;
let core: ReturnType<typeof useTreeCore>;
let tabs: ReturnType<typeof useTabCreation>;
const scheduleCmdInject = vi.fn();
const onCountRef = { current: undefined };
const restoreSettled = { current: Promise.resolve() };

function Harness() {
  core = useTreeCore({ projectName: "web", onCountRef });
  tabs = useTabCreation({
    projectName: "web",
    treeRef: core.treeRef,
    focusedRef: core.focusedRef,
    restoreSettled,
    applyTree: core.applyTree,
    forward: vi.fn(),
    scheduleCmdInject,
    scheduleSeedInject: vi.fn(),
  });
  return null;
}

// act holds React's render until it ends, so every launch here lands before one.
async function launchTogether(...ids: string[]) {
  for (const id of ids) {
    bridge.StartTerminalForConfig.mockResolvedValueOnce({
      id,
      startCmd: "claude",
      resumeCmd: "claude --resume",
    });
  }
  await act(async () => {
    await Promise.all(
      ids.map(() => tabs.createTerminalWithCmd("Claude", "claude", { configName: "claude" })),
    );
  });
}

const tabStrip = () =>
  core.tree ? collectTerminals(core.tree).map((t) => [t.id, t.label]) : [];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  bridge.StartTerminalForConfig.mockReset();
  scheduleCmdInject.mockClear();
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useTabCreation", () => {
  it("keeps every tab when several launches finish before a render", async () => {
    act(() => core.applyTree(makePaneLeaf("p1", [makeTerminal("pty-1", "Claude")]), "p1"));

    await launchTogether("pty-2", "pty-3");

    expect(tabStrip()).toEqual([
      ["pty-1", "Claude"],
      ["pty-2", "Claude 2"],
      ["pty-3", "Claude 3"],
    ]);
    expect(scheduleCmdInject.mock.calls.map(([id]) => id)).toEqual(["pty-2", "pty-3"]);
  });

  it("keeps every tab when several launches open a project with none", async () => {
    await launchTogether("pty-1", "pty-2");

    expect(tabStrip()).toEqual([
      ["pty-1", "Claude"],
      ["pty-2", "Claude 2"],
    ]);
  });
});
