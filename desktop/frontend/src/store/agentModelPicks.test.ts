import { beforeEach, describe, expect, it } from "vitest";
import { agentModelPick, mergeAgentModelPick, useAgentModelPicks } from "./agentModelPicks";

beforeEach(() => useAgentModelPicks.setState({ byTerminal: {} }));

describe("mergeAgentModelPick", () => {
  it("keeps the half a reading says nothing about", () => {
    mergeAgentModelPick("t1", { model: "opus" });
    mergeAgentModelPick("t1", { effort: "high" });
    expect(agentModelPick("t1")).toEqual({ model: "opus", effort: "high" });

    mergeAgentModelPick("t1", { model: "sonnet" });
    expect(agentModelPick("t1")).toEqual({ model: "sonnet", effort: "high" });
  });

  it("keeps terminals apart", () => {
    mergeAgentModelPick("t1", { model: "opus" });
    mergeAgentModelPick("t2", { model: "haiku" });
    expect(agentModelPick("t1").model).toBe("opus");
    expect(agentModelPick("t2").model).toBe("haiku");
  });

  it("reads as empty for a terminal nothing is known about", () => {
    expect(agentModelPick("never-seen")).toEqual({ model: "", effort: "" });
  });

  it("holds its reference when nothing changes, so subscribers don't re-render", () => {
    mergeAgentModelPick("t1", { model: "opus", effort: "high" });
    const first = agentModelPick("t1");
    mergeAgentModelPick("t1", { model: "opus" });
    expect(agentModelPick("t1")).toBe(first);
  });

  it("lets setPick replace outright, which is how a refused pick is put back", () => {
    mergeAgentModelPick("t1", { model: "opus", effort: "high" });
    useAgentModelPicks.getState().setPick("t1", { model: "", effort: "high" });
    expect(agentModelPick("t1")).toEqual({ model: "", effort: "high" });
  });
});
