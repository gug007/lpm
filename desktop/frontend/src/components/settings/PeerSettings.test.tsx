// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeerClient } from "../../peer/usePeerState";

const mocks = vi.hoisted(() => ({
  settingsGet: vi.fn(),
  settingsSet: vi.fn(),
  peerInvoke: vi.fn(),
  app: { settingsTab: "general", projects: [], setSettingsTab: () => {}, setUsageOpen: () => {} },
}));

vi.mock("../../../bridge/runtime", () => ({ EventsOn: vi.fn(() => () => {}), BrowserOpenURL: vi.fn() }));
vi.mock("../../store/app", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(mocks.app),
}));

vi.mock("../../../bridge/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../bridge/commands")>()),
  PeerSettingsGet: mocks.settingsGet,
  PeerSettingsSet: mocks.settingsSet,
  PeerInvoke: mocks.peerInvoke,
}));

import { PeerSettings } from "./PeerSettings";

const STUDIO: PeerClient = {
  slug: "aabbccdd",
  alias: "Studio",
  host: "10.0.0.2",
  port: 8766,
  enabled: true,
  connected: true,
  platform: "macos",
  supportsHostSettings: true,
  version: "0.7.20",
};

let container: HTMLElement;
let root: Root;

async function render(peer: Partial<PeerClient> = {}) {
  await act(async () => {
    root.render(<PeerSettings peer={{ ...STUDIO, ...peer }} picker={null} onNavigate={() => {}} />);
  });
}

const toggle = (label: string) =>
  document.querySelector(`[role=switch][aria-label="${label}"]`) as HTMLButtonElement | null;
const buttonNamed = (name: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
const navTabs = () =>
  [...document.querySelectorAll("nav button:not([data-settings-back])")].map((b) => b.textContent?.trim());

beforeEach(() => {
  mocks.settingsGet.mockReset();
  mocks.settingsSet.mockReset();
  mocks.peerInvoke.mockReset().mockResolvedValue([]);
  mocks.app.settingsTab = "general";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("PeerSettings", () => {
  it("shows what the machine has stored, and its defaults for what it hasn't", async () => {
    mocks.settingsGet.mockResolvedValue({ defaultProjectDirectory: "/Users/me/Code" });
    await render();
    expect(mocks.settingsGet).toHaveBeenCalledWith("aabbccdd");
    expect(document.body.textContent).toContain("Studio");
    expect(document.body.textContent).toContain("/Users/me/Code");
    expect(document.body.textContent).toContain("0.7.20");
    expect(toggle("Double-click to start/stop")?.getAttribute("aria-checked")).toBe("false");
  });

  it("shows its Git defaults on the Git page", async () => {
    mocks.app.settingsTab = "git";
    mocks.settingsGet.mockResolvedValue({});
    await render();
    expect(toggle("Check for new commits")?.getAttribute("aria-checked")).toBe("true");
  });

  it("offers the pages a Mac someone uses has, and none of this one's own", async () => {
    mocks.settingsGet.mockResolvedValue({});
    await render();
    expect(navTabs()).toEqual([
      "General",
      "Notifications",
      "Terminal",
      "Shortcuts",
      "Agents",
      "Accounts & usage",
      "Git",
      "Templates",
      "Global config",
      "Mobile devices",
    ]);
    expect(buttonNamed("Remove")).toBeUndefined();
  });

  it("saves a change on the machine and shows what it stored", async () => {
    mocks.app.settingsTab = "git";
    mocks.settingsGet.mockResolvedValue({});
    mocks.settingsSet.mockResolvedValue({ checkOrigin: false });
    await render();
    await act(async () => toggle("Check for new commits")!.click());
    expect(mocks.settingsSet).toHaveBeenCalledWith("aabbccdd", { checkOrigin: false });
    expect(toggle("Check for new commits")?.getAttribute("aria-checked")).toBe("false");
  });

  it("puts a change back when the machine refuses it", async () => {
    mocks.app.settingsTab = "git";
    mocks.settingsGet.mockResolvedValue({ checkOrigin: true });
    mocks.settingsSet.mockRejectedValue("peer disconnected");
    await render();
    await act(async () => toggle("Check for new commits")!.click());
    expect(mocks.settingsGet).toHaveBeenCalledTimes(2);
    expect(toggle("Check for new commits")?.getAttribute("aria-checked")).toBe("true");
  });

  it("clears the default folder back to unset", async () => {
    mocks.settingsGet.mockResolvedValue({ defaultProjectDirectory: "/srv/work" });
    mocks.settingsSet.mockResolvedValue({});
    await render();
    await act(async () => buttonNamed("Clear")!.click());
    expect(mocks.settingsSet).toHaveBeenCalledWith("aabbccdd", { defaultProjectDirectory: null });
    expect(document.body.textContent).toContain("Not set");
  });

  it("changes its terminal, with the fonts it has", async () => {
    mocks.app.settingsTab = "terminal";
    mocks.settingsGet.mockResolvedValue({ terminalFontSize: 14 });
    mocks.settingsSet.mockResolvedValue({ terminalFontSize: 15 });
    await render();
    expect(mocks.peerInvoke).toHaveBeenCalledWith("aabbccdd", "list_monospace_fonts", {});
    const bigger = document.querySelector('[aria-label="Increase terminal font size"]') as HTMLButtonElement;
    await act(async () => bigger.click());
    expect(mocks.settingsSet).toHaveBeenCalledWith("aabbccdd", { terminalFontSize: 15 });
  });

  it("leaves how a screen looks off a machine nobody sits at", async () => {
    mocks.settingsGet.mockResolvedValue({});
    await render({ platform: "linux", headless: true });
    expect(navTabs()).toEqual([
      "General",
      "Notifications",
      "Agents",
      "Accounts & usage",
      "Git",
      "Templates",
      "Global config",
      "Mobile devices",
    ]);
    expect(buttonNamed("Choose…")).toBeTruthy();
    expect(toggle("Double-click to start/stop")).toBeNull();
    expect(buttonNamed("Light")).toBeUndefined();
  });

  it("asks for an update instead of asking a machine that can't answer", async () => {
    await render({ supportsHostSettings: false });
    expect(mocks.settingsGet).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("runs an older lpm");
  });

  it("waits for a machine that isn't connected", async () => {
    await render({ connected: false });
    expect(mocks.settingsGet).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("isn’t connected right now");
  });

  it("offers another try when the settings can't be read", async () => {
    mocks.settingsGet.mockRejectedValueOnce("peer request timed out").mockResolvedValue({});
    await render();
    expect(document.body.textContent).toContain("peer request timed out");
    await act(async () => buttonNamed("Try Again")!.click());
    expect(mocks.settingsGet).toHaveBeenCalledTimes(2);
    expect(toggle("Double-click to start/stop")).toBeTruthy();
  });
});
