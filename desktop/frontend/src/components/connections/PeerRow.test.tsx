// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeerClient } from "../../peer/usePeerState";

const mocks = vi.hoisted(() => ({
  reconnect: vi.fn(() => Promise.resolve()),
  setEnabled: vi.fn(() => Promise.resolve()),
  updateHost: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../bridge/commands", () => ({
  PeerReconnect: mocks.reconnect,
  PeerSetAlias: vi.fn(() => Promise.resolve()),
  PeerSetEnabled: mocks.setEnabled,
  PeerUpdateHost: mocks.updateHost,
}));

const { PeerRow } = await import("./PeerRow");

const peer = (over: Partial<PeerClient> = {}): PeerClient => ({
  slug: "abcd1234",
  alias: "Studio",
  host: "10.0.0.2",
  port: 8766,
  enabled: true,
  connected: false,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const render = (p: PeerClient, appVersion = "") =>
  act(() => {
    root.render(
      <PeerRow
        peer={p}
        onRemove={vi.fn()}
        refresh={() => Promise.resolve()}
        appVersion={appVersion}
      />,
    );
  });

const button = (label: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("PeerRow", () => {
  it("says what a failure means and keeps the raw error in the tooltip", () => {
    render(peer({ lastError: "Operation timed out (os error 60)" }));
    expect(container.textContent).toContain("Not responding");
    expect(container.textContent).not.toContain("os error 60");
    expect(container.querySelector('[title*="os error 60"]')).not.toBeNull();
  });

  it("offers a retry once a dial has failed, and takes it", () => {
    render(peer({ lastError: "Connection refused (os error 61)" }));
    act(() => button("Reconnect")?.click());
    expect(mocks.reconnect).toHaveBeenCalledWith("abcd1234");
  });

  // Interrupting a dial that is still in flight only makes it start over.
  it("keeps quiet while a connection is still being attempted", () => {
    render(peer());
    expect(container.textContent).toContain("Connecting…");
    expect(button("Reconnect")).toBeUndefined();
  });

  // A host answers a failed action with several lines whose useful one is rarely
  // the first — a known-hosts notice or a login banner comes ahead of the reason.
  it("shows all of a failed action's output, and keeps reporting the machine", async () => {
    const refused = Promise.reject(
      "Warning: Permanently added '[localhost]:34275' to the list of known hosts.\nPermission denied (publickey).",
    );
    refused.catch(() => {});
    mocks.updateHost.mockReturnValueOnce(refused);
    render(
      peer({ platform: "linux", sshHost: "localhost", version: "1.0.0", connected: true }),
      "1.2.0",
    );

    act(() => button("Update")?.click());
    await act(async () => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent?.trim() === "Update" && !container.contains(b))
        ?.click();
    });

    const shown = [...container.querySelectorAll("p")].find((p) =>
      p.textContent?.includes("Permission denied (publickey)."),
    );
    // Clipping is what hid the reason behind the notice, so it is the thing to pin.
    expect(shown?.className).not.toContain("truncate");
    expect(container.textContent).toContain("Connected");
  });

  it("has nothing to retry on a peer that is switched off", () => {
    render(peer({ enabled: false, lastError: "Operation timed out (os error 60)" }));
    expect(container.textContent).toContain("Off");
    expect(button("Reconnect")).toBeUndefined();
  });
});
