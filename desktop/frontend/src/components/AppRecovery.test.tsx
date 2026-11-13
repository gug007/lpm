// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ offered: vi.fn(), send: vi.fn() }));
vi.mock("../../bridge/commands", () => ({
  GetPlatform: vi.fn(async () => "darwin/arm64"),
  GetVersion: vi.fn(async () => "1.2.3"),
  SetClipboardText: vi.fn(async () => {}),
}));
vi.mock("../crashReports", () => ({ manualReportOffered: mocks.offered, sendCrashReport: mocks.send }));

import { AppRecovery } from "./AppRecovery";

let container: HTMLElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(<AppRecovery error={new Error("render failed")} componentStack="at Sidebar" onRetry={() => {}} />);
  });
}

const sendButton = () =>
  [...container.querySelectorAll("button")].find((button) =>
    ["Send report", "Sending…", "Report sent", "Couldn't send"].includes(button.textContent ?? ""),
  );

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mocks.offered.mockResolvedValue(true);
  mocks.send.mockResolvedValue(true);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("AppRecovery", () => {
  it("offers to send this crash, and sends it when asked", async () => {
    await render();
    expect(sendButton()?.textContent).toBe("Send report");
    expect(mocks.send).not.toHaveBeenCalled();

    await act(async () => sendButton()?.click());

    expect(mocks.send).toHaveBeenCalledWith({
      event: "recovery.sent_by_hand",
      error: new Error("render failed"),
      details: { componentStack: "at Sidebar" },
    });
    expect(sendButton()?.textContent).toBe("Report sent");
    expect(sendButton()?.disabled).toBe(true);
  });

  it("lets a report that didn't go through be sent again", async () => {
    mocks.send.mockResolvedValue(false);
    await render();

    await act(async () => sendButton()?.click());

    expect(sendButton()?.textContent).toBe("Couldn't send");
    expect(sendButton()?.disabled).toBe(false);
  });

  it("has nothing to offer where there is no report to send by hand", async () => {
    mocks.offered.mockResolvedValue(false);
    await render();
    expect(sendButton()).toBeUndefined();
  });
});
