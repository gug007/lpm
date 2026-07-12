import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/commands", () =>
  new Proxy({}, { has: () => true, get: (_t, prop) => (prop === "then" ? undefined : vi.fn()) }));
vi.mock("../../bridge/runtime", () =>
  new Proxy({}, { has: () => true, get: (_t, prop) => (prop === "then" ? undefined : vi.fn()) }));

// Spy on the persisted-cache write without touching the real terminals binding.
const h = vi.hoisted(() => ({ appendPersistedTab: vi.fn() }));
vi.mock("../terminals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../terminals")>()),
  appendPersistedTab: h.appendPersistedTab,
}));

import { useAppStore } from "./app";

describe("adoptRemoteTerminal", () => {
  beforeEach(() => {
    useAppStore.setState({
      pendingAdoptTerminal: null,
      visited: new Set<string>(),
      selected: null,
      detached: new Set<string>(),
    });
    h.appendPersistedTab.mockClear();
  });

  it("queues a live adopt op when the project is mounted, without persisting", () => {
    useAppStore.setState({ visited: new Set(["proj"]) });
    const s = useAppStore.getState();

    s.adoptRemoteTerminal("proj", "proj-3", "server", {
      startCmd: "npm run dev",
      resumeCmd: "npm run dev",
      actionName: "server",
    });

    const op = useAppStore.getState().pendingAdoptTerminal!;
    expect(op.projectName).toBe("proj");
    expect(op.id).toBe("proj-3");
    expect(op.label).toBe("server");
    expect(op.resumeCmd).toBe("npm run dev");
    expect(h.appendPersistedTab).not.toHaveBeenCalled();

    // A repeat adopt re-fires with a higher nonce so the consumer isn't latched.
    const firstNonce = op.nonce;
    useAppStore.getState().clearPendingAdoptTerminal();
    s.adoptRemoteTerminal("proj", "proj-4", "", undefined);
    expect(useAppStore.getState().pendingAdoptTerminal!.nonce).toBeGreaterThan(firstNonce);
  });

  it("adopts a selected or detached project via the live op too", () => {
    useAppStore.setState({ selected: "sel" });
    useAppStore.getState().adoptRemoteTerminal("sel", "sel-1", "", undefined);
    expect(useAppStore.getState().pendingAdoptTerminal?.projectName).toBe("sel");

    useAppStore.setState({ pendingAdoptTerminal: null, detached: new Set(["det"]) });
    useAppStore.getState().adoptRemoteTerminal("det", "det-1", "", undefined);
    expect(useAppStore.getState().pendingAdoptTerminal?.projectName).toBe("det");
    expect(h.appendPersistedTab).not.toHaveBeenCalled();
  });

  it("parks the tab in the persisted cache when the project is not mounted", () => {
    useAppStore.getState().adoptRemoteTerminal("other", "other-1", "web", {
      resumeCmd: "npm start",
      actionName: "web",
    });

    expect(useAppStore.getState().pendingAdoptTerminal).toBeNull();
    expect(h.appendPersistedTab).toHaveBeenCalledWith(
      "other",
      expect.objectContaining({ label: "web", resumeCmd: "npm start", actionName: "web" }),
    );
  });
});
