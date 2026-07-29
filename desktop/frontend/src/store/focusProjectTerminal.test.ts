import { describe, expect, it, vi } from "vitest";

// vi.mock hoists above any const, so the factories are inlined. `then` must
// stay undefined: a function there makes the mocked module thenable and
// vitest awaits it forever.
vi.mock("../../bridge/commands", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => (prop === "then" ? undefined : vi.fn()),
  }));
vi.mock("../../bridge/runtime", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => (prop === "then" ? undefined : vi.fn()),
  }));

import { useAppStore } from "./app";

describe("focusProjectTerminal", () => {
  it("activates the owning project and parks the terminal in one update", () => {
    useAppStore.setState({ selected: null, view: "settings", visited: new Set() });

    useAppStore.getState().focusProjectTerminal("web", "t1");

    const s = useAppStore.getState();
    expect(s.selected).toBe("web");
    expect(s.view).toBe("projects");
    expect(s.visited.has("web")).toBe(true);
    expect(s.pendingFocusTerminal).toMatchObject({ projectName: "web", terminalId: "t1" });
  });

  it("navigates like any other project selection", () => {
    useAppStore.setState({
      selected: "api",
      selectedTemplate: "node",
      view: "template",
      mruProjects: ["api", "web"],
    });

    useAppStore.getState().focusProjectTerminal("web", "t1");

    const s = useAppStore.getState();
    expect(s.selectedTemplate).toBeNull();
    expect(s.mruProjects).toEqual(["web", "api"]);
  });

  it("issues a fresh nonce per request so a repeat re-fires", () => {
    const s = useAppStore.getState();
    s.focusProjectTerminal("web", "t1");
    const first = useAppStore.getState().pendingFocusTerminal!.nonce;
    s.clearPendingFocusTerminal();
    expect(useAppStore.getState().pendingFocusTerminal).toBeNull();

    s.focusProjectTerminal("web", "t1");
    expect(useAppStore.getState().pendingFocusTerminal!.nonce).not.toBe(first);
  });
});
