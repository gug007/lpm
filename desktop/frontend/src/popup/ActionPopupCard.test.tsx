// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionInfo, ActionPopupInfo } from "../types";
import type { PopupContent } from "./popupTypes";

const actionPopup = vi.hoisted(() => vi.fn());
vi.mock("../../bridge/runtime", () => ({ EventsOn: () => () => {} }));
vi.mock("../platform", async (original) => ({ ...(await original<typeof import("../platform")>()), isLinux: true }));
vi.mock("../../bridge/commands", () => ({
  ActionPopup: actionPopup,
  HtmlPreviewRoot: vi.fn(() => Promise.resolve(null)),
  PopupViewOpen: vi.fn(() => Promise.resolve()),
  PopupViewPlace: vi.fn(() => Promise.resolve()),
  PopupViewPush: vi.fn(() => Promise.resolve()),
  PopupViewClose: vi.fn(() => Promise.resolve()),
}));

import { ActionPopupCard } from "./ActionPopupCard";

const popup: ActionPopupInfo = { format: "html", title: "GitHub stars", width: 300, height: 160 };
const action = { name: "stars", label: "Stars", cmd: "x", confirm: false, display: "", popup } as ActionInfo;

const content = (over: Partial<PopupContent>): PopupContent => ({
  refresh: 0,
  data: null,
  updatedAt: Date.now(),
  ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  actionPopup.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function show(info: ActionPopupInfo = popup) {
  await act(async () => {
    root.render(<ActionPopupCard project="web" action={action} popup={info} open />);
  });
  await act(async () => {});
}

describe("ActionPopupCard", () => {
  it("draws the page in a sandboxed frame with the data", async () => {
    actionPopup.mockResolvedValue(content({ html: "<p>stars</p>", data: { total: 3 } }));
    await show();
    expect(actionPopup).toHaveBeenCalledWith("web", "stars", false);
    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame?.getAttribute("srcdoc")).toContain('"total":3');
    expect(container.textContent).toContain("GitHub stars");
  });

  it("shows why the page couldn't be made instead of it", async () => {
    actionPopup.mockResolvedValue(content({ error: "Can't find popups/stars.html." }));
    await show();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).toContain("Can't find popups/stars.html.");
  });

  it("keeps the page and names data that didn't come", async () => {
    actionPopup.mockResolvedValue(content({ html: "<p></p>", dataError: "The data command exited with 1: bad token." }));
    await show();
    expect(container.querySelector("iframe")).not.toBeNull();
    expect(container.textContent).toContain("Data: The data command exited with 1: bad token.");
  });

  it("survives a failed request", async () => {
    actionPopup.mockRejectedValue("peer offline");
    await show();
    expect(container.textContent).toContain("peer offline");
  });

  it("shows what it showed last at once and makes it again when stale", async () => {
    actionPopup
      .mockResolvedValueOnce(content({ html: "<p></p>", data: { total: 1 }, stale: true }))
      .mockResolvedValueOnce(content({ html: "<p></p>", data: { total: 2 } }));
    await show();
    await act(async () => {});
    expect(actionPopup.mock.calls).toEqual([
      ["web", "stars", false],
      ["web", "stars", true],
    ]);
    expect(container.querySelector("iframe")).not.toBeNull();
    expect(container.textContent).toContain("just now");
  });

  it("keeps the last good page when a refresh fails, and says why", async () => {
    actionPopup.mockResolvedValue(
      content({ html: "<p></p>", data: { total: 1 }, refreshError: "The data command exited with 1: rate limited." }),
    );
    await show();
    expect(container.querySelector("iframe")).not.toBeNull();
    expect(container.textContent).toContain("Couldn't refresh: The data command exited with 1: rate limited.");
  });

  it("runs nothing for a config problem or a format it can't draw", async () => {
    await show({ ...popup, problem: "This popup's config needs a format key." });
    expect(container.textContent).toContain("This popup's config needs a format key");
    await show({ ...popup, format: "vega" });
    expect(container.textContent).toContain("needs a newer lpm");
    expect(actionPopup).not.toHaveBeenCalled();
  });
});
