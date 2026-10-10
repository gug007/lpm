// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settingsGet: vi.fn(),
  settingsSet: vi.fn(),
}));

vi.mock("../../bridge/commands", () => ({
  PeerSettingsGet: mocks.settingsGet,
  PeerSettingsSet: mocks.settingsSet,
  PeerInvoke: vi.fn(() => new Promise(() => {})),
}));

import { PeerSettingsModal } from "./PeerSettingsModal";

let container: HTMLElement;
let root: Root;

async function render(props: Record<string, unknown> = {}) {
  await act(async () => {
    root.render(
      <PeerSettingsModal
        open
        slug="aabbccdd"
        alias="Studio"
        headless={false}
        supported
        onClose={() => {}}
        {...(props as object)}
      />,
    );
  });
}

const toggle = (label: string) =>
  document.querySelector(`[role=switch][aria-label="${label}"]`) as HTMLButtonElement | null;
const buttonNamed = (name: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);

beforeEach(() => {
  mocks.settingsGet.mockReset();
  mocks.settingsSet.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("PeerSettingsModal", () => {
  it("shows what the machine has stored, and its defaults for what it hasn't", async () => {
    mocks.settingsGet.mockResolvedValue({ defaultProjectDirectory: "/Users/me/Code" });
    await render();
    expect(mocks.settingsGet).toHaveBeenCalledWith("aabbccdd");
    expect(document.body.textContent).toContain("Settings on Studio");
    expect(document.body.textContent).toContain("/Users/me/Code");
    expect(toggle("Check for new commits")?.getAttribute("aria-checked")).toBe("true");
    expect(toggle("Double-click to start/stop")?.getAttribute("aria-checked")).toBe("false");
  });

  it("saves a change on the machine and shows what it stored", async () => {
    mocks.settingsGet.mockResolvedValue({});
    mocks.settingsSet.mockResolvedValue({ checkOrigin: false });
    await render();
    await act(async () => toggle("Check for new commits")!.click());
    expect(mocks.settingsSet).toHaveBeenCalledWith("aabbccdd", { checkOrigin: false });
    expect(toggle("Check for new commits")?.getAttribute("aria-checked")).toBe("false");
  });

  it("puts a change back when the machine refuses it, and says why", async () => {
    mocks.settingsGet.mockResolvedValue({ checkOrigin: true });
    mocks.settingsSet.mockRejectedValue("peer disconnected");
    await render();
    await act(async () => toggle("Check for new commits")!.click());
    expect(toggle("Check for new commits")?.getAttribute("aria-checked")).toBe("true");
    expect(document.body.textContent).toContain("peer disconnected");
  });

  it("clears the default folder back to unset", async () => {
    mocks.settingsGet.mockResolvedValue({ defaultProjectDirectory: "/srv/work" });
    mocks.settingsSet.mockResolvedValue({});
    await render();
    await act(async () => buttonNamed("Clear")!.click());
    expect(mocks.settingsSet).toHaveBeenCalledWith("aabbccdd", { defaultProjectDirectory: null });
    expect(document.body.textContent).toContain("Not set");
  });

  it("leaves out the sidebar setting for a machine nobody sits at", async () => {
    mocks.settingsGet.mockResolvedValue({});
    await render({ headless: true });
    expect(toggle("Check for new commits")).toBeTruthy();
    expect(toggle("Double-click to start/stop")).toBeNull();
  });

  it("asks for an update instead of asking a machine that can't answer", async () => {
    await render({ supported: false });
    expect(mocks.settingsGet).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("runs an older lpm");
  });

  it("offers another try when the settings can't be read", async () => {
    mocks.settingsGet.mockRejectedValueOnce("peer request timed out").mockResolvedValue({});
    await render();
    expect(document.body.textContent).toContain("peer request timed out");
    await act(async () => buttonNamed("Try Again")!.click());
    expect(mocks.settingsGet).toHaveBeenCalledTimes(2);
    expect(toggle("Check for new commits")).toBeTruthy();
  });
});
