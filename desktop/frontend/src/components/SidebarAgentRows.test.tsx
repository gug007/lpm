// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarAgentRows } from "./SidebarAgentRows";
import { SidebarAgentSummary } from "./SidebarAgentSummary";
import type { SidebarAgentRow } from "../sidebarAgents";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// The shared clock is read where it stood when the module loaded, a beat behind
// `Date.now()` here — the extra seconds keep the reading off the minute's edge.
const agent = (over: Partial<SidebarAgentRow> = {}): SidebarAgentRow => ({
  key: "claude_code_a",
  state: "needs-you",
  title: "Rebalance worker",
  provider: "Claude Code",
  terminalId: "%1",
  since: Date.now() - (4 * 60 + 5) * 1000,
  ...over,
});

describe("SidebarAgentRows", () => {
  it("names each task after its tab and times it", () => {
    act(() => {
      root.render(
        <SidebarAgentRows
          projectName="crypto-portfolio"
          agents={[
            agent(),
            agent({ key: "codex_1", state: "working", title: "Codex", provider: "Codex" }),
            agent({
              key: "claude_code_b",
              state: "done",
              title: "Ship the picker",
              since: 1_000,
              until: 1_000 + 90_000,
            }),
            agent({ key: "codex_2", state: "idle", title: "Scratch", since: null }),
          ]}
          onOpenAgent={vi.fn()}
        />,
      );
    });

    const rows = [...container.querySelectorAll("button")];
    expect(rows[0].textContent).toBe("Rebalance worker4m");
    expect(rows[1].textContent).toBe("Codex4m");
    // A finished turn reads as how long it took, held still.
    expect(rows[2].textContent).toBe("Ship the picker1m");
    // Idle has no clock worth reading — it is not doing anything.
    expect(rows[3].textContent).toBe("Scratch");
    // The state the mark stands for stays one hover away.
    expect(rows[0].title).toBe("Needs you — Claude Code in crypto-portfolio");
    // A mark for the state that wants the user, a check for the one that
    // landed; work in progress and idle read as color on the name alone.
    expect(rows[0].querySelector("svg")).not.toBeNull();
    expect(rows[1].querySelector("svg")).toBeNull();
    expect(rows[2].querySelector("svg")).not.toBeNull();
    expect(rows[3].querySelector("svg")).toBeNull();
  });

  it("opens the terminal the clicked agent is in", () => {
    const onOpenAgent = vi.fn();
    act(() => {
      root.render(
        <SidebarAgentRows
          projectName="crypto-portfolio"
          agents={[agent()]}
          onOpenAgent={onOpenAgent}
        />,
      );
    });

    act(() => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpenAgent).toHaveBeenCalledWith(
      "crypto-portfolio",
      expect.objectContaining({ terminalId: "%1" }),
    );
  });
});

describe("SidebarAgentSummary", () => {
  it("names a state the user has to act on", () => {
    act(() => root.render(<SidebarAgentSummary agent={agent()} />));
    expect(container.textContent).toBe("Needs you");

    act(() => root.render(<SidebarAgentSummary agent={agent({ state: "error" })} />));
    expect(container.textContent).toBe("Problem");
  });

  // Which agent gets to speak on the project row is `sidebarProjectAlert`'s
  // call, and is covered there.
});
