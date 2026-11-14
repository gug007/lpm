// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ available: vi.fn(), open: vi.fn() }));

vi.mock("../../bridge/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../bridge/commands")>()),
  VoiceToTextAvailable: () => bridge.available(),
}));
vi.mock("../../bridge/runtime", () => ({ EventsOn: () => () => {}, BrowserOpenURL: bridge.open }));

import { VoiceToTextInstallModal } from "./VoiceToTextInstallModal";

let host: HTMLDivElement;
let root: Root;
const onClose = vi.fn();
const onInstalled = vi.fn();

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
  if (!found) throw new Error(`no button ${label}`);
  return found;
}

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("VoiceToTextInstallModal", () => {
  it("stays open after Download and starts once VoiceToText is installed", async () => {
    bridge.available.mockResolvedValue(false);
    await act(async () => {
      root.render(<VoiceToTextInstallModal open onClose={onClose} onInstalled={onInstalled} />);
    });

    await act(async () => button("Download").click());
    expect(bridge.open).toHaveBeenCalledWith(expect.stringContaining("VoiceToText.dmg"));
    expect(document.body.textContent).toContain("Setting up VoiceToText");
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onInstalled).not.toHaveBeenCalled();

    bridge.available.mockResolvedValue(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onInstalled).toHaveBeenCalledTimes(1);
  });

  it("doesn't look for VoiceToText before Download", async () => {
    bridge.available.mockResolvedValue(true);
    await act(async () => {
      root.render(<VoiceToTextInstallModal open onClose={onClose} onInstalled={onInstalled} />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(bridge.available).not.toHaveBeenCalled();
    expect(button("Not now")).toBeTruthy();
  });
});
