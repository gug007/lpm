// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./SidebarAgentAsk", () => ({ SidebarAgentAsk: () => null }));
vi.mock("./SidebarSendLaterMark", () => ({ SidebarSendLaterMark: () => null }));

import { SidebarPinned } from "./SidebarPinned";
import type { SidebarAgentRow } from "../sidebarAgents";
import { useCollapsedAgents, useCollapsedPinnedAgents } from "../sidebarCollapsed";
import type { ProjectInfo } from "../types";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  useCollapsedAgents.setState({ collapsed: new Set() });
  useCollapsedPinnedAgents.setState({ collapsed: new Set() });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const project = (name: string): ProjectInfo =>
  ({
    name,
    root: `/Users/dev/${name}`,
    running: true,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries: [],
  }) as unknown as ProjectInfo;

const agent: SidebarAgentRow = {
  key: "claude_code_a",
  keys: ["claude_code_a"],
  state: "working",
  title: "Claude tab account switch",
  provider: "Claude Code",
  shared: [],
  holdsError: false,
  terminalId: "%1",
  since: Date.now() - 5 * 60 * 1000,
};

function renderPinned(onOpenAgent = vi.fn()) {
  const projects = [project("lpm"), project("reader")];
  act(() => {
    root.render(
      <SidebarPinned
        projects={projects}
        byName={new Map(projects.map((p) => [p.name, p]))}
        agentsByProject={new Map([["lpm", [agent]]])}
        focusedTerminals={{}}
        selected={null}
        menuFor={null}
        width={240}
        windowOf={() => "here"}
        onSelect={vi.fn()}
        onOpenMenu={vi.fn()}
        onReorder={vi.fn()}
        onOpenAgent={onOpenAgent}
        onAgentAction={vi.fn()}
      />,
    );
  });
}

const agentLines = () => [...container.querySelectorAll<HTMLButtonElement>("[data-agent-row]")];
const chevron = (name: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label$="agents in ${name}"]`);

describe("SidebarPinned", () => {
  it("lists a pinned project's agents under its row", () => {
    const onOpenAgent = vi.fn();
    renderPinned(onOpenAgent);
    expect(agentLines()).toHaveLength(1);
    expect(agentLines()[0].textContent).toContain("Claude tab account switch");
    act(() => agentLines()[0].click());
    expect(onOpenAgent).toHaveBeenCalledWith("lpm", agent);
  });

  it("offers the chevron only to a project with agents", () => {
    renderPinned();
    expect(chevron("lpm")).not.toBeNull();
    expect(chevron("reader")).toBeNull();
  });

  it("closes its agents without closing the project's row in the list", () => {
    renderPinned();
    act(() => chevron("lpm")!.click());
    expect(agentLines()).toHaveLength(0);
    expect(chevron("lpm")!.getAttribute("aria-expanded")).toBe("false");
    expect(useCollapsedAgents.getState().collapsed.has("lpm")).toBe(false);
    act(() => chevron("lpm")!.click());
    expect(agentLines()).toHaveLength(1);
  });
});
