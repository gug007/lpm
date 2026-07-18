import { describe, expect, it } from "vitest";
import { agentToolsAction } from "./SkillInstallControl";

describe("agentToolsAction", () => {
  it("installs when the skill is missing", () => {
    expect(agentToolsAction("not-installed", "installed")).toBe("install");
  });

  it("updates when the CLI needs (re)install", () => {
    expect(agentToolsAction("installed", "not-installed")).toBe("update");
    expect(agentToolsAction("installed", "points-elsewhere")).toBe("update");
  });

  it("updates when the skill is outdated", () => {
    expect(agentToolsAction("outdated", "installed")).toBe("update");
  });

  it("offers no action when both are current", () => {
    expect(agentToolsAction("installed", "installed")).toBeNull();
    expect(agentToolsAction("installed", "unavailable")).toBeNull();
  });

  it("does not offer install/update for a shadowed CLI — reinstalling can't fix it", () => {
    expect(agentToolsAction("installed", "shadowed")).toBeNull();
  });

  it("still updates a shadowed CLI when the skill itself is outdated", () => {
    expect(agentToolsAction("outdated", "shadowed")).toBe("update");
  });

  it("waits while anything is loading", () => {
    expect(agentToolsAction("loading", "installed")).toBeNull();
    expect(agentToolsAction("installed", "loading")).toBeNull();
  });
});
