import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/commands", () =>
  new Proxy({}, {
    has: () => true,
    get: (_target, property) => (property === "then" ? undefined : vi.fn()),
  }));
vi.mock("../../bridge/runtime", () =>
  new Proxy({}, {
    has: () => true,
    get: (_target, property) => (property === "then" ? undefined : vi.fn()),
  }));

import { useAppStore } from "./app";

describe("toggleAgentOverview", () => {
  beforeEach(() => {
    useAppStore.setState({ selected: "web", view: "projects" });
  });

  it("opens the overview and returns to the selected project", () => {
    useAppStore.getState().toggleAgentOverview();
    expect(useAppStore.getState()).toMatchObject({
      selected: "web",
      view: "fleet",
    });

    useAppStore.getState().toggleAgentOverview();
    expect(useAppStore.getState()).toMatchObject({
      selected: "web",
      view: "projects",
    });
  });

  it("opens the overview from another top-level view", () => {
    useAppStore.setState({ view: "settings" });

    useAppStore.getState().toggleAgentOverview();

    expect(useAppStore.getState().view).toBe("fleet");
  });
});
