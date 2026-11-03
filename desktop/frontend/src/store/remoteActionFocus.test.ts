import { describe, expect, it, vi } from "vitest";

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

describe("triggerRemoteAction", () => {
  it("opens a phone's new tab behind what is on screen", () => {
    useAppStore.setState({ selected: "other" });
    useAppStore.getState().triggerRemoteAction("proj", null, undefined, undefined, { agent: { agent: "claude" } });
    expect(useAppStore.getState().pendingRemoteAction?.background).toBe(true);
    expect(useAppStore.getState().selected).toBe("other");
  });

  it("puts the project and its new tab on screen when asked for here", () => {
    useAppStore.setState({ selected: "other" });
    useAppStore.getState().triggerRemoteAction("proj", null, undefined, undefined, {
      agent: { agent: "claude" },
      focus: true,
    });
    expect(useAppStore.getState().pendingRemoteAction?.background).toBe(false);
    expect(useAppStore.getState().selected).toBe("proj");
  });

  it("does the same for a confirmed action", () => {
    useAppStore.setState({ selected: "other" });
    useAppStore.getState().triggerRemoteAction("proj", "codex", {}, true, { prompt: "fix it", focus: true });
    expect(useAppStore.getState().pendingRemoteAction?.background).toBe(false);
    expect(useAppStore.getState().selected).toBe("proj");
  });
});
