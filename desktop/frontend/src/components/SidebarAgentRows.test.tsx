// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarAgentRows } from "./SidebarAgentRows";
import { SidebarAgentSummary } from "./SidebarAgentSummary";
import type { SidebarAgentRow } from "../sidebarAgents";
import { useArchivingAgents } from "../agentArchive";
import { useSettingsStore } from "../store/settings";

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
  shared: 0,
  holdsError: false,
  terminalId: "%1",
  since: Date.now() - (4 * 60 + 5) * 1000,
  ...over,
  keys: [over.key ?? "claude_code_a"],
});

const lines = () => [...container.querySelectorAll<HTMLButtonElement>("[data-agent-row]")];

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

    const rows = lines();
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

  it("marks only the row whose terminal is on screen", () => {
    const rowsFor = (activeTerminalId: string | null) => {
      act(() => {
        root.render(
          <SidebarAgentRows
            projectName="crypto-portfolio"
            agents={[
              agent({ key: "a", terminalId: "%1" }),
              agent({ key: "b", terminalId: "%2" }),
              // A status whose pane the backend never named can't be the tab on
              // screen, however the id compares.
              agent({ key: "c", terminalId: null }),
            ]}
            activeTerminalId={activeTerminalId}
            onOpenAgent={vi.fn()}
          />,
        );
      });
      return lines().map((b) => b.className.includes("bg-[var(--text-primary)]/8"));
    };

    expect(rowsFor("%2")).toEqual([false, true, false]);
    // Nothing is marked for a project that isn't the one being looked at.
    expect(rowsFor(null)).toEqual([false, false, false]);
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

describe("SidebarAgentRows menu", () => {
  const onAgentAction = vi.fn();
  const openMenu = (over: Partial<SidebarAgentRow> = {}, actions = true) => {
    act(() => {
      root.render(
        <SidebarAgentRows
          projectName="crypto-portfolio"
          agents={[agent(over)]}
          onOpenAgent={vi.fn()}
          onAgentAction={actions ? onAgentAction : undefined}
        />,
      );
    });
    act(() => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 40, clientY: 80 }),
      );
    });
    return [...document.querySelectorAll(".menu-pop button")].map((b) => b.textContent);
  };

  it("offers the tab's actions and hands them back with the row", () => {
    expect(openMenu()).toEqual([
      "Open",
      "Copy last answer",
      "Fork session",
      "Share tab…",
      expect.stringContaining("Answer it first"),
      "Close tab",
    ]);
    expect(document.querySelector(".menu-pop")?.textContent).toContain("Claude Code · Needs you");
    act(() => {
      [...document.querySelectorAll<HTMLButtonElement>(".menu-pop button")]
        .find((b) => b.textContent === "Close tab")
        ?.click();
    });
    expect(onAgentAction).toHaveBeenCalledWith(
      "crypto-portfolio",
      expect.objectContaining({ terminalId: "%1" }),
      "close",
      { x: 40, y: 80 },
    );
    expect(document.querySelector(".menu-pop")).toBeNull();
  });

  it("only opens a row that has no tab yet, or no one to act on it", () => {
    const archiveLater = expect.stringContaining("Answer it first");
    expect(openMenu({ terminalId: null })).toEqual(["Open", archiveLater]);
    act(() => document.querySelector<HTMLButtonElement>(".menu-pop button")?.click());
    expect(openMenu({}, false)).toEqual(["Open", archiveLater]);
  });

  it("keeps Archive out of reach until the turn ends", () => {
    openMenu({ state: "working" });
    const archive = [...document.querySelectorAll<HTMLButtonElement>(".menu-pop button")].find((b) =>
      b.textContent?.startsWith("Archive"),
    );
    expect(archive?.disabled).toBe(true);
    expect(archive?.textContent).toContain("Available once the turn ends");
  });

  it("lets a seen finish go back to unread, or be archived", () => {
    const labels = openMenu({ state: "done", seenAt: 1 });
    expect(labels).toContain("Mark as unread");
    expect(labels.find((l) => l?.startsWith("Archive"))).not.toContain("Answer it first");
    expect(document.querySelector(".menu-pop")?.textContent).toContain("Done · Seen");
  });

  it("offers to mark a new finish seen only while finished agents are kept", () => {
    expect(openMenu({ state: "error" })).not.toContain("Mark as seen");
    act(() => document.querySelector<HTMLButtonElement>(".menu-pop button")?.click());
    useSettingsStore.setState({ keepFinishedAgents: true });
    try {
      expect(openMenu({ state: "error" })).toContain("Mark as seen");
    } finally {
      useSettingsStore.setState({ keepFinishedAgents: undefined });
    }
  });
});

describe("SidebarAgentSummary", () => {
  it("names the state it is given", () => {
    act(() => root.render(<SidebarAgentSummary agent={agent({ state: "error" })} />));
    expect(container.textContent).toBe("Problem");
  });

  // Which agent gets to speak on the project row is `sidebarProjectAlert`'s
  // call, and is covered there.
});

describe("SidebarAgentRows seen agents", () => {
  const render = (agents: SidebarAgentRow[]) =>
    act(() => {
      root.render(<SidebarAgentRows projectName="crypto-portfolio" agents={agents} onOpenAgent={vi.fn()} />);
    });

  it("folds the older seen agents past the number Settings shows", () => {
    render([
      agent({ key: "a", state: "done", seenAt: 1 }),
      agent({ key: "b", state: "done", seenAt: 2 }),
      agent({ key: "c", state: "done", seenAt: 3 }),
      agent({ key: "d", state: "done", seenAt: 4 }),
      agent({ key: "e", state: "done" }),
    ]);
    expect(lines().map((b) => b.dataset.agentRow)).toEqual(["b", "c", "d", "e"]);
    expect(container.textContent).toContain("1 more seen");
  });

  it("archives a finished row from the keyboard", () => {
    render([agent({ key: "claude_code_z", state: "done", seenAt: 1 })]);
    act(() => {
      lines()[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });
    expect(useArchivingAgents.getState().hidden["crypto-portfolio"]).toEqual(["claude_code_z"]);
  });

  it("offers Archive on hover only where the turn has ended", () => {
    render([agent({ key: "w", state: "working" }), agent({ key: "d", state: "done" })]);
    expect([...container.querySelectorAll("[aria-label^='Archive']")].map((b) => b.getAttribute("aria-label"))).toEqual([
      "Archive Rebalance worker",
    ]);
  });
});
