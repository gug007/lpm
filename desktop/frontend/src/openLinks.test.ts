// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast };
});

vi.mock("../bridge/commands", () =>
  new Proxy(
    {},
    { has: () => true, get: (_t, prop) => (prop === "then" ? undefined : vi.fn(async () => null)) },
  ),
);
vi.mock("../bridge/runtime", () => ({ EventsOn: vi.fn(() => () => {}) }));
vi.mock("./notifications/toast", () => ({ toast: mocks.toast }));

import { openLink, projectLink, tabLink } from "./openLinks";
import { useAppStore } from "./store/app";
import { useLaunchpadSeed } from "./store/launchpadSeed";
import { useTerminalTargets } from "./store/terminalTargets";
import type { ProjectInfo } from "./types";

const project = (name: string, label = "") => ({ name, label }) as ProjectInfo;

describe("links", () => {
  it("name a project and a tab by its persisted key", () => {
    expect(projectLink("My App")).toBe("lpm://open?project=My%20App");
    expect(tabLink("saas-app", "t/1")).toBe("lpm://open?project=saas-app&tab=t%2F1");
  });
});

describe("openLink", () => {
  const selectProject = vi.fn();
  const focusProjectTerminal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ projects: [project("saas-app", "SaaS")], selectProject, focusProjectTerminal });
    useLaunchpadSeed.setState({ seed: null });
    useTerminalTargets.setState({ byProject: {} });
  });

  it("says so when the project isn't in lpm", () => {
    openLink({ kind: "open", project: "gone" });
    expect(mocks.toast.error).toHaveBeenCalledWith("No project named “gone” in lpm.");
    expect(selectProject).not.toHaveBeenCalled();
  });

  it("goes to a tab that is open", () => {
    useTerminalTargets.setState({
      byProject: { "saas-app": [{ id: "pty-9", label: "Claude", emoji: "", historyKey: "k1" }] },
    });
    openLink({ kind: "open", project: "saas-app", tab: "k1" });
    expect(focusProjectTerminal).toHaveBeenCalledWith("saas-app", "pty-9");
  });

  it("waits for a tab that comes back once its project opens", () => {
    openLink({ kind: "open", project: "saas-app", tab: "k1" });
    expect(selectProject).toHaveBeenCalledWith("saas-app");
    useTerminalTargets.getState().setProjectTargets("saas-app", [
      { id: "pty-3", label: "Claude", emoji: "", historyKey: "k1" },
    ]);
    expect(focusProjectTerminal).toHaveBeenCalledWith("saas-app", "pty-3");
  });

  it("leaves a draft prompt in the project's new-tab box without starting anything", () => {
    openLink({ kind: "new", project: "saas-app", agent: "codex", prompt: "Add a test" });
    expect(selectProject).toHaveBeenCalledWith("saas-app");
    expect(useLaunchpadSeed.getState().seed).toMatchObject({
      projectName: "saas-app",
      agent: "codex",
      text: "Add a test",
    });
    expect(focusProjectTerminal).not.toHaveBeenCalled();
  });
});
