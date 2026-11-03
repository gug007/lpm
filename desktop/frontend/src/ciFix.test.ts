// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionInfo, ProjectInfo } from "./types";

const app = vi.hoisted(() => ({
  projects: [] as ProjectInfo[],
  trigger: vi.fn(),
  start: vi.fn(),
}));

vi.mock("./store/app", () => ({
  useAppStore: { getState: () => ({ projects: app.projects, triggerRemoteAction: app.trigger }) },
}));
vi.mock("./sendToNewTab", () => ({
  newTabAgent: (agent: string) => ({ launch: { agent, model: "", effort: "" } }),
  startPromptInNewTab: app.start,
}));

import { fixTabs, preferredFixOption, startFix } from "./ciFix";
import { loadRememberedChild } from "./components/splitPrimary";
import { saveLaunchpadAction } from "./launchpadAgentActions";

const action = (name: string, cmd: string, extra: Partial<ActionInfo> = {}): ActionInfo =>
  ({ name, label: name.split(":").pop(), cmd, confirm: false, display: "header", type: "terminal", ...extra }) as ActionInfo;

const claudeMax = action("claude-max", "", {
  primary: "last-used",
  children: [action("claude-max:claude", "claude"), action("claude-max:ultracode", "claude --model opus")],
});
const codex = action("codex", "codex");
const worktree = action("worktree", "claude", { inputs: [{ key: "branch", label: "Branch" }] } as Partial<ActionInfo>);

const withActions = (actions: ActionInfo[]) => {
  app.projects = [{ name: "web", actions } as ProjectInfo];
};

beforeEach(() => {
  window.localStorage.clear();
  app.projects = [];
  app.trigger.mockReset();
  app.start.mockReset();
});

describe("fixTabs", () => {
  it("offers the project's agent actions, as its launchpad does", () => {
    withActions([claudeMax, codex]);
    expect(fixTabs("web").map((t) => t.options.map((o) => o.id))).toEqual([
      ["claude-max:claude", "claude-max:ultracode"],
      ["codex"],
    ]);
  });

  it("offers every agent CLI to a project without agent actions", () => {
    expect(fixTabs("web").map((t) => t.key)).toEqual(["claude", "codex", "gemini", "opencode"]);
  });
});

describe("preferredFixOption", () => {
  it("leads with the first agent until one is used", () => {
    withActions([claudeMax, codex]);
    expect(preferredFixOption(fixTabs("web"))?.id).toBe("claude-max:claude");
  });

  it("follows the launchpad's last pick", () => {
    withActions([claudeMax, codex]);
    saveLaunchpadAction("codex");
    expect(preferredFixOption(fixTabs("web"))?.id).toBe("codex");
  });

  it("keeps the agent last used for a fix, in another project too", () => {
    withActions([claudeMax, codex]);
    saveLaunchpadAction("claude-max:ultracode");
    startFix("web", fixTabs("web")[1].options[0], "fix it");
    expect(preferredFixOption(fixTabs("web"))?.id).toBe("codex");
    app.projects = [{ name: "api", actions: [action("codex-fast", "codex --fast")] } as ProjectInfo];
    expect(preferredFixOption(fixTabs("api"))?.id).toBe("codex-fast");
    app.projects = [{ name: "plain", actions: [] } as unknown as ProjectInfo];
    expect(preferredFixOption(fixTabs("plain"))?.id).toBe("codex");
  });
});

describe("startFix", () => {
  it("starts a bare agent in a new tab with the prompt and shows it", () => {
    const [claude] = fixTabs("web")[0].options;
    startFix("web", claude, "CI checks are failing");
    expect(app.start).toHaveBeenCalledWith(
      "web",
      { agent: "claude", model: "", effort: "" },
      "CI checks are failing",
      {},
      true,
    );
  });

  it("runs an agent action with the prompt and shows its tab", () => {
    withActions([claudeMax, codex]);
    startFix("web", fixTabs("web")[1].options[0], "fix it");
    expect(app.trigger).toHaveBeenCalledWith("web", "codex", {}, true, { prompt: "fix it", focus: true });
  });

  it("makes a split's item the one its button leads with", () => {
    withActions([claudeMax]);
    const ultracode = fixTabs("web")[0].options[1];
    startFix("web", ultracode, "fix it");
    expect(app.trigger).toHaveBeenCalledWith("web", "claude-max:ultracode", {}, true, { prompt: "fix it", focus: true });
    expect(loadRememberedChild("web", "claude-max")).toBe("ultracode");
  });

  it("asks first for an action that asks", () => {
    withActions([worktree]);
    startFix("web", fixTabs("web")[0].options[0], "fix it");
    expect(app.trigger).toHaveBeenCalledWith("web", "worktree", undefined, false, { prompt: "fix it", focus: true });
  });
});
