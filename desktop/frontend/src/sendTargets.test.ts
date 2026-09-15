import { describe, it, expect } from "vitest";
import { buildSendTargets, flattenTargets, GLOBAL_TERMINALS_LABEL } from "./sendTargets";
import { GLOBAL_TERMINALS_KEY } from "./terminals";

const tab = (id: string, label: string) => ({ id, label, emoji: "", historyKey: `hk-${id}` });

const base = {
  labelOf: (name: string) => name.toUpperCase(),
  sourceProject: "api",
  sourceTerminalId: "api-1",
};

describe("buildSendTargets", () => {
  it("leads with the source project and trails with the global terminals", () => {
    const groups = buildSendTargets({
      ...base,
      byProject: {
        [GLOBAL_TERMINALS_KEY]: [tab("g-1", "Scratch")],
        web: [tab("web-1", "Claude")],
        api: [tab("api-1", "Claude"), tab("api-2", "Shell")],
      },
      mru: ["api", "web"],
    });
    expect(groups.map((g) => g.projectName)).toEqual(["api", "web", GLOBAL_TERMINALS_KEY]);
    expect(groups[2].projectLabel).toBe(GLOBAL_TERMINALS_LABEL);
  });

  it("drops the terminal the prompt is being written in", () => {
    const groups = buildSendTargets({
      ...base,
      byProject: { api: [tab("api-1", "Claude"), tab("api-2", "Shell")] },
    });
    expect(flattenTargets(groups).map((r) => r.terminalId)).toEqual(["api-2"]);
  });

  it("drops a project left with no tabs to offer", () => {
    const groups = buildSendTargets({
      ...base,
      byProject: { api: [tab("api-1", "Claude")], web: [] },
    });
    expect(groups).toEqual([]);
  });

  it("orders other projects by recency, then by whatever is left", () => {
    const groups = buildSendTargets({
      ...base,
      byProject: {
        zebra: [tab("z-1", "Shell")],
        web: [tab("web-1", "Shell")],
        docs: [tab("d-1", "Shell")],
      },
      mru: ["web", "docs"],
    });
    expect(groups.map((g) => g.projectName)).toEqual(["web", "docs", "zebra"]);
  });

  it("matches a query against the tab name", () => {
    const groups = buildSendTargets({
      ...base,
      byProject: { web: [tab("web-1", "Claude"), tab("web-2", "Shell")] },
      query: "shell",
    });
    expect(flattenTargets(groups).map((r) => r.label)).toEqual(["Shell"]);
  });

  it("keeps every tab of a project whose own name matches", () => {
    const groups = buildSendTargets({
      ...base,
      byProject: { web: [tab("web-1", "Claude"), tab("web-2", "Shell")] },
      query: "we",
    });
    expect(flattenTargets(groups)).toHaveLength(2);
  });

  it("marks a tab on another Mac as off-host", () => {
    const groups = buildSendTargets({
      ...base,
      byProject: {
        "peer-a1b2c3d4-web": [tab("peer-a1b2c3d4-web-1", "Claude")],
        web: [tab("web-1", "Claude")],
      },
    });
    const rows = flattenTargets(groups);
    expect(rows.find((r) => r.projectName === "web")?.offHost).toBe(false);
    expect(rows.find((r) => r.projectName.startsWith("peer-"))?.offHost).toBe(true);
  });

  it("treats another tab on the same peer host as on-host", () => {
    const groups = buildSendTargets({
      ...base,
      sourceProject: "peer-a1b2c3d4-web",
      sourceTerminalId: "peer-a1b2c3d4-web-1",
      byProject: { "peer-a1b2c3d4-web": [tab("peer-a1b2c3d4-web-2", "Shell")] },
    });
    expect(flattenTargets(groups)[0].offHost).toBe(false);
  });
});
