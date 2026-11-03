// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { rememberChild } from "./components/splitPrimary";
import { launchpadTabs, startsOwnTask } from "./launchpadAgentActions";
import type { ActionInfo } from "./types";

const action = (name: string, cmd: string, extra: Partial<ActionInfo> = {}): ActionInfo =>
  ({ name, label: name.split(":").pop(), cmd, confirm: false, display: "header", type: "terminal", ...extra }) as ActionInfo;

const claudeMax = action("claude-max", "", {
  primary: "last-used",
  color: "claude-deep",
  children: [
    action("claude-max:claude", "claude --permission-mode auto"),
    action("claude-max:ultracode", "claude --model opus"),
    action("claude-max:notes", "open notes.md"),
  ],
});
const codex = action("codex", "codex -c 'model_reasoning_effort=\"ultra\"'");
const dev = action("dev", "npm run dev");

describe("launchpadTabs", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps split buttons and menus whole, with only their agent items", () => {
    const tabs = launchpadTabs([claudeMax, codex, dev], "web");
    expect(tabs.map((t) => [t.key, t.options.map((o) => o.id)])).toEqual([
      ["claude-max", ["claude-max:claude", "claude-max:ultracode"]],
      ["codex", ["codex"]],
    ]);
    const [ultracode] = tabs[0].options.slice(1);
    expect(ultracode.group).toBe(claudeMax);
    expect(tabs[1].options[0].group).toBeUndefined();
  });

  it("offers the bare CLIs when no action starts an agent in a terminal", () => {
    const tabs = launchpadTabs([dev, action("review", "claude -p 'review'", { type: "background" })], "web");
    expect(tabs.map((t) => t.key)).toEqual(["claude", "codex", "gemini", "opencode"]);
    expect(tabs[0].options[0].action).toBeUndefined();
  });

  it("leads a split button with the item it last ran", () => {
    rememberChild("web", "claude-max", "ultracode");
    const [group] = launchpadTabs([claudeMax], "web");
    expect(group.primary?.id).toBe("claude-max:ultracode");
    expect(group.options.map((o) => o.label)).toEqual(["claude", "ultracode"]);
  });

  it("gives a plain menu no main part", () => {
    const [tab] = launchpadTabs([{ ...claudeMax, primary: undefined }], "web");
    expect(tab.primary).toBeNull();
  });
});

describe("startsOwnTask", () => {
  const own = (cmd: string, prompt?: string) => startsOwnTask({ cmd, prompt });

  it("sees a task in the agent's own words or in a saved prompt", () => {
    expect(own(`claude "Review my changes"`)).toBe(true);
    expect(own(`claude --model opus 'Fix the failing tests'`)).toBe(true);
    expect(own("claude", "Write the release notes")).toBe(true);
  });

  it("leaves flags, their values and other commands alone", () => {
    expect(own("claude --permission-mode auto")).toBe(false);
    expect(own(`codex -c 'model_reasoning_effort="ultra"'`)).toBe(false);
    expect(own(`claude --append-system-prompt "Be brief"`)).toBe(false);
    expect(own(`codex -c model="gpt 6"`)).toBe(false);
    expect(own(`claude && echo "all done now"`)).toBe(false);
    expect(own(`cd "my project" && claude`)).toBe(false);
    expect(own("claude", "  ")).toBe(false);
  });

  it("keeps such actions off a list for a prompt that is the task", () => {
    const review = action("review", `claude "Review my changes"`);
    const tabs = launchpadTabs([claudeMax, review, codex], "web", { skipOwnTasks: true });
    expect(tabs.map((t) => t.key)).toEqual(["claude-max", "codex"]);
    expect(launchpadTabs([review], "web", { skipOwnTasks: true }).map((t) => t.key)).toEqual([
      "claude",
      "codex",
      "gemini",
      "opencode",
    ]);
  });
});
