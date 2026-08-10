// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STATUS_RUNNING, STATUS_WAITING, type ProjectInfo, type StatusEntry } from "../types";

const mocks = vi.hoisted(() => ({ focusProjectTerminal: vi.fn() }));

vi.mock("../store/app", () => ({
  useAppStore: (select: (state: unknown) => unknown) =>
    select({ focusProjectTerminal: mocks.focusProjectTerminal }),
}));

import { SidebarPeerRow } from "./SidebarPeerRow";
import { useCollapsedAgents } from "../sidebarCollapsed";
import { useTerminalTitles } from "../store/terminalTitles";

// A paired host's project as it reaches this Mac: the name carries the peer
// marker the app routes by, and so do the pane ids on its statuses.
const NAME = "peer-aabbccdd-demo";
const PANE = "peer-aabbccdd-demo-1";
const T0 = Date.now() - 90_000;

function entry(key: string, value: string, paneID: string): StatusEntry {
  return { key, value, priority: 0, timestamp: T0, turnStart: T0, paneID };
}

function project(entries: StatusEntry[]): ProjectInfo {
  return {
    name: NAME,
    session: NAME,
    root: "/@peer-aabbccdd/Users/dev/demo",
    label: "demo",
    running: true,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries: entries,
    isRemote: true,
  };
}

let container: HTMLDivElement;
let root: Root;

function render(entries: StatusEntry[], onSelect = vi.fn()) {
  act(() => {
    root.render(
      <SidebarPeerRow
        project={project(entries)}
        label="demo"
        selected={false}
        isContextTarget={false}
        onSelect={onSelect}
        onContextMenu={vi.fn()}
      />,
    );
  });
}

function agentRows(): HTMLButtonElement[] {
  return [...container.querySelectorAll("button")].filter(
    (b) => b.getAttribute("title")?.includes(" in demo"),
  ) as HTMLButtonElement[];
}

function chevron(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>("[aria-expanded]")!;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  localStorage.clear();
  useCollapsedAgents.setState({ collapsed: new Set() });
  useTerminalTitles.getState().setProjectTitles(NAME, { [PANE]: "Rebalance worker" });
  mocks.focusProjectTerminal.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useTerminalTitles.getState().clearProjectTitles(NAME);
});

describe("SidebarPeerRow", () => {
  it("lists the host's agents, named by the tab mirrored here", () => {
    render([
      entry("claude_code_a", STATUS_WAITING, PANE),
      entry("codex_b", STATUS_RUNNING, "peer-aabbccdd-demo-2"),
    ]);

    expect(agentRows().map((r) => r.textContent)).toEqual([
      "Rebalance worker1m",
      // No tab of that id is open here, so the row names the agent instead.
      "Codex1m",
    ]);
    // The row itself stays quiet — a wait reads as the amber project name.
    expect(container.textContent).not.toContain("Needs you");
  });

  it("says nothing extra for a project with no agents", () => {
    render([]);
    expect(agentRows()).toHaveLength(0);
    expect(container.querySelector("[aria-expanded]")).toBeNull();
  });

  it("opens the mirrored terminal an agent runs in", () => {
    render([entry("claude_code_a", STATUS_WAITING, PANE)]);

    act(() => {
      agentRows()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mocks.focusProjectTerminal).toHaveBeenCalledWith(NAME, PANE);
  });

  it("falls back to the project for a status the host never named a pane for", () => {
    const onSelect = vi.fn();
    render([entry("claude_code_a", STATUS_WAITING, "")], onSelect);

    act(() => {
      agentRows()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mocks.focusProjectTerminal).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalled();
  });

  it("collapses the list and remembers it by the row's routing name", () => {
    render([entry("claude_code_a", STATUS_WAITING, PANE)]);
    expect(chevron().getAttribute("aria-expanded")).toBe("true");

    act(() => {
      chevron().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(agentRows()).toHaveLength(0);
    expect(chevron().getAttribute("aria-expanded")).toBe("false");
    expect(JSON.parse(localStorage.getItem("lpm-sidebar-collapsed-projects")!)).toEqual([NAME]);
  });
});
