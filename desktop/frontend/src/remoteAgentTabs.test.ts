import { describe, expect, it, vi } from "vitest";
import type { TerminalViewHandle } from "./components/TerminalView";
import {
  agentLaunchAction,
  agentOptionsForRemote,
  agentTabCommand,
  launchRemoteAgent,
  resumeRemoteSession,
} from "./remoteAgentTabs";
import { updateProjectTerminalsCache } from "./terminals";
import type { ActionInfo } from "./types";

const SESSION = "4bd82b0f-c9a4-493f-9985-a976099768d4";

function action(overrides: Partial<ActionInfo>): ActionInfo {
  return {
    name: "claude",
    label: "Claude",
    cmd: "claude --permission-mode auto",
    confirm: false,
    display: "header",
    type: "terminal",
    ...overrides,
  };
}

function fakeView(live = new Map<string, string>()) {
  return {
    createTerminal: vi.fn(),
    createTerminalWithCmd: vi.fn(),
    resumeFromHistory: vi.fn(),
    liveAgentSessions: () => live,
  };
}

const asHandle = (view: ReturnType<typeof fakeView>) => view as unknown as TerminalViewHandle;

describe("agentOptionsForRemote", () => {
  it("lists every agent, with levels per model", () => {
    const agents = agentOptionsForRemote();
    expect(agents.map((a) => a.id)).toEqual(["claude", "codex", "gemini", "opencode"]);
    const claude = agents[0];
    expect(claude.label).toBe("Claude Code");
    expect(claude.models[0]).toMatchObject({ value: "", label: "Default" });
    expect(claude.models[0].efforts.map((e) => e.value)).toContain("max");
    expect(agents[2].models).toEqual([]);
  });

  it("offers Codex's top levels only on the models that take them", () => {
    const codex = agentOptionsForRemote()[1];
    const efforts = (model: string) =>
      codex.models.find((m) => m.value === model)?.efforts.map((e) => e.value) ?? [];
    expect(efforts("gpt-6.1-sol")).toContain("ultra");
    expect(efforts("gpt-5.4-nano")).not.toContain("max");
  });
});

describe("agentLaunchAction", () => {
  it("finds the project's own button for the agent, inside menus too", () => {
    const own = action({ name: "agents:claude" });
    const menu = action({ name: "agents", cmd: "", children: [own] });
    expect(agentLaunchAction([menu], "claude")).toBe(own);
  });

  it("skips buttons that ask questions, carry a task, or start another agent", () => {
    const actions = [
      action({ name: "ask", inputs: [{ name: "q", kind: "text" } as never] }),
      action({ name: "task", prompt: "review the PR" }),
      action({ name: "codex", cmd: "codex --yolo" }),
      action({ name: "bg", type: "background" }),
    ];
    expect(agentLaunchAction(actions, "claude")).toBeNull();
    expect(agentLaunchAction(actions, "codex")?.name).toBe("codex");
  });
});

describe("launchRemoteAgent", () => {
  it("runs the project's button in a new tab, pinned to the pick", () => {
    const view = fakeView();
    launchRemoteAgent(asHandle(view), [action({ emoji: "✳" })], {
      agent: "claude",
      model: "opus",
      effort: "high",
      prompt: "  fix the test ",
    });
    expect(view.createTerminalWithCmd).toHaveBeenCalledWith("Claude", "claude --permission-mode auto", {
      configName: "claude",
      actionName: "claude",
      emoji: "✳",
      color: undefined,
      prompt: "fix the test",
      launchModel: { model: "opus", effort: "high" },
      background: true,
    });
  });

  it("starts the bare CLI when the project has no button for it", () => {
    const view = fakeView();
    launchRemoteAgent(asHandle(view), [], { agent: "gemini", prompt: "" });
    expect(view.createTerminalWithCmd).toHaveBeenCalledWith("Gemini", "gemini", {
      prompt: undefined,
      launchModel: { model: "", effort: "" },
      background: true,
    });
  });

  it("falls back to a shell for an agent this build doesn't know", () => {
    const view = fakeView();
    launchRemoteAgent(asHandle(view), [], { agent: "someday" });
    expect(view.createTerminal).toHaveBeenCalledWith(true);
  });

  it("opens the tab in front when asked for at this Mac", () => {
    const view = fakeView();
    launchRemoteAgent(asHandle(view), [], { agent: "gemini" }, false);
    expect(view.createTerminalWithCmd).toHaveBeenCalledWith("Gemini", "gemini", expect.objectContaining({ background: false }));
    launchRemoteAgent(asHandle(view), [], { agent: "someday" }, false);
    expect(view.createTerminal).toHaveBeenCalledWith(false);
  });
});

describe("agentTabCommand", () => {
  it("opens in front, so + can put it in its own pane", () => {
    const tab = agentTabCommand([], { agent: "codex", model: "gpt-6.1-sol", effort: "ultra", prompt: "go" });
    expect(tab).toEqual({
      label: "Codex",
      cmd: "codex",
      opts: { prompt: "go", launchModel: { model: "gpt-6.1-sol", effort: "ultra" } },
    });
  });

  it("has nothing to open for an agent this build doesn't know", () => {
    expect(agentTabCommand([], { agent: "someday" })).toBeNull();
  });
});

describe("resumeRemoteSession", () => {
  it("continues the conversation behind the tab in view", () => {
    const view = fakeView();
    resumeRemoteSession(asHandle(view), "fresh", {
      provider: "claude",
      sessionId: SESSION,
      title: "Fix checkout tax rounding",
    });
    expect(view.resumeFromHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Claude",
        sessionTitle: "Fix checkout tax rounding",
        resumeCmd: `claude --resume ${SESSION}`,
      }),
      true,
    );
  });

  it("keeps a closed tab's own command and name", () => {
    updateProjectTerminalsCache("named", {
      detailView: "terminal",
      history: [
        {
          label: "Claude",
          sessionTitle: "My checkout fix",
          sessionTitleSource: "manual",
          resumeCmd: `claude --resume ${SESSION} --permission-mode auto`,
          actionName: "claude",
          closedAt: 5,
        },
      ],
    });
    const view = fakeView();
    resumeRemoteSession(asHandle(view), "named", { provider: "claude", sessionId: SESSION, title: "Agent title" });
    expect(view.resumeFromHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionTitle: "My checkout fix",
        resumeCmd: `claude --resume ${SESSION} --permission-mode auto`,
        actionName: "claude",
      }),
      true,
    );
  });

  it("opens nothing for a conversation already in a tab", () => {
    const view = fakeView(new Map([[SESSION, "t-1"]]));
    resumeRemoteSession(asHandle(view), "fresh", { provider: "claude", sessionId: SESSION });
    expect(view.resumeFromHistory).not.toHaveBeenCalled();
  });

  it("ignores a provider it can't resume", () => {
    const view = fakeView();
    resumeRemoteSession(asHandle(view), "fresh", { provider: "gemini", sessionId: SESSION });
    expect(view.resumeFromHistory).not.toHaveBeenCalled();
  });
});
