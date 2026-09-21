import { beforeEach, describe, expect, it } from "vitest";
import {
  agentModelEffortAt,
  agentModelPick,
  mergeAgentModelPick,
  setAgentModelPick,
  useAgentModelPicks,
} from "./agentModelPicks";

beforeEach(() => useAgentModelPicks.setState({ byTerminal: {}, effortAt: {} }));

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
    useAgentModelPicks.getState().setPick("t1", { model: "", effort: "high" }, 1);
    expect(agentModelPick("t1")).toEqual({ model: "", effort: "high" });
  });

  it("stamps the level with when its evidence was true, and only then", () => {
    mergeAgentModelPick("t1", { model: "opus", effort: "high" }, 500);
    expect(agentModelEffortAt("t1")).toBe(500);

    // A reading about the model alone says nothing about when the level was
    // last known, so the stamp it would be compared against must not move.
    mergeAgentModelPick("t1", { model: "sonnet" }, 900);
    expect(agentModelEffortAt("t1")).toBe(500);

    setAgentModelPick("t1", { model: "sonnet", effort: "max" }, 900);
    expect(agentModelEffortAt("t1")).toBe(900);
  });

  it("advances the stamp when a fresher reading confirms the same level", () => {
    mergeAgentModelPick("t1", { model: "opus", effort: "high" }, 500);
    const first = agentModelPick("t1");
    mergeAgentModelPick("t1", { model: "opus", effort: "high" }, 900);
    expect(agentModelPick("t1")).toBe(first);
    expect(agentModelEffortAt("t1")).toBe(900);
  });

  it("reads as never established for a terminal with no level", () => {
    expect(agentModelEffortAt("never-seen")).toBe(0);
  });
});
