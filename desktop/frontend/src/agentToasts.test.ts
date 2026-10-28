import { describe, expect, it } from "vitest";
import { agentChanges, agentToastId, type ProjectAgents } from "./agentToasts";
import type { AgentState } from "./agentStatus";
import type { SidebarAgentRow } from "./sidebarAgents";

const row = (key: string, state: AgentState): SidebarAgentRow => ({
  key,
  state,
  title: `tab ${key}`,
  provider: "Claude Code",
  terminalId: `t-${key}`,
  since: null,
  shared: 0,
  holdsError: state === "error",
  keys: [key],
});

const agents = (...rows: SidebarAgentRow[]): ProjectAgents[] => [{ project: "web", rows }];

describe("agentChanges", () => {
  it("reports agents reaching a state worth telling about, once each", () => {
    const seen = new Map<string, AgentState>();
    agentChanges(seen, agents(row("a", "working"), row("b", "working")));

    const { arrivals } = agentChanges(seen, agents(row("a", "needs-you"), row("b", "working")));
    expect(arrivals.map((a) => [a.row.key, a.row.state])).toEqual([["a", "needs-you"]]);

    expect(agentChanges(seen, agents(row("a", "needs-you"), row("b", "working"))).arrivals).toEqual([]);
  });

  it("takes an agent's first sighting as where it starts, not as news", () => {
    const seen = new Map<string, AgentState>();
    expect(agentChanges(seen, agents(row("a", "needs-you"), row("b", "error"))).arrivals).toEqual([]);
  });

  it("settles the toast of an agent that moved on or went away", () => {
    const seen = new Map<string, AgentState>();
    agentChanges(seen, agents(row("a", "needs-you"), row("b", "error")));

    const { arrivals, settled } = agentChanges(seen, agents(row("a", "working")));
    expect(arrivals).toEqual([]);
    expect(settled).toEqual([agentToastId("web", "a"), agentToastId("web", "b")]);
  });
});
