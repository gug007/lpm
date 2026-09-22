// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkout: vi.fn(),
  pull: vi.fn(),
  open: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  settings: {} as Record<string, unknown>,
}));

vi.mock("../../bridge/commands", () => ({
  CheckoutBranch: (...args: unknown[]) => mocks.checkout(...args),
  PullBranch: (...args: unknown[]) => mocks.pull(...args),
}));
vi.mock("../../bridge/runtime", () => ({
  BrowserOpenURL: (url: string) => mocks.open(url),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock("../store/settings", () => ({
  getSettings: () => mocks.settings,
}));

import { PRCreatedView } from "./PRCreatedView";

let container: HTMLDivElement;
let root: Root;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

function buttons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button"));
}

function render(onSwitched = vi.fn(), onBusyChange = vi.fn()) {
  act(() =>
    root.render(
      <PRCreatedView
        projectPath="/p"
        branch="feat/x"
        base="main"
        url="https://github.com/o/r/pull/9"
        onSwitched={onSwitched}
        onBusyChange={onBusyChange}
      />,
    ),
  );
  return { onSwitched, onBusyChange };
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.settings = {};
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("PRCreatedView", () => {
  it("shows the branch pair and opens the PR on GitHub", () => {
    render();
    expect(container.textContent).toContain("Pull request created");
    expect(container.textContent).toContain("feat/x → main");
    const [switchBtn, openBtn] = buttons();
    expect(switchBtn.textContent).toBe("Switch to main and pull");
    act(() => openBtn.click());
    expect(mocks.open).toHaveBeenCalledWith("https://github.com/o/r/pull/9");
  });

  it("checks out the base, pulls with the saved strategy, then reports back", async () => {
    mocks.settings = { gitPull: { strategy: "rebase", autoStash: true, prune: false } };
    mocks.checkout.mockResolvedValue(undefined);
    mocks.pull.mockResolvedValue(undefined);
    const { onSwitched, onBusyChange } = render();

    act(() => buttons()[0].click());
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(buttons()[0].textContent).toBe("Switching to main…");
    await flush();

    expect(mocks.checkout).toHaveBeenCalledWith("/p", "main", "");
    expect(mocks.pull).toHaveBeenCalledTimes(1);
    expect(mocks.pull.mock.calls[0][0]).toBe("/p");
    expect(mocks.pull.mock.calls[0][1]).toBe("rebase");
    expect(mocks.checkout.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.pull.mock.invocationCallOrder[0],
    );
    expect(mocks.success).toHaveBeenCalledWith(
      "Switched to main and pulled the latest changes",
    );
    expect(onSwitched).toHaveBeenCalledTimes(1);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it("stays put and does not pull when the checkout fails", async () => {
    mocks.checkout.mockRejectedValue(new Error("dirty tree"));
    const { onSwitched } = render();

    act(() => buttons()[0].click());
    await flush();

    expect(mocks.pull).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("Switch to main: Error: dirty tree");
    expect(onSwitched).not.toHaveBeenCalled();
    expect(buttons()[0].textContent).toBe("Switch to main and pull");
  });

  it("still reports the switch when only the pull fails", async () => {
    mocks.checkout.mockResolvedValue(undefined);
    mocks.pull.mockRejectedValue(new Error("no upstream"));
    const { onSwitched } = render();

    act(() => buttons()[0].click());
    await flush();

    expect(mocks.error).toHaveBeenCalledWith(
      "Switched to main, but pull failed: Error: no upstream",
    );
    expect(onSwitched).toHaveBeenCalledTimes(1);
  });
});
