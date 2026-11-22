// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkForUpdate: vi.fn(),
  getVersion: vi.fn(),
}));

vi.mock("./terminal/TabMoveToSubmenu", () => ({ TabMoveToSubmenu: () => null }));
vi.mock("../hooks/useAgentRowDrag", () => ({
  useAgentRowDrag: () => ({ dropLine: null, onPointerDownCapture: () => {}, onClickCapture: () => {} }),
}));
vi.mock("../../bridge/commands", () => ({
  CheckForUpdate: mocks.checkForUpdate,
  GetVersion: mocks.getVersion,
}));
vi.mock("../../bridge/runtime", () => ({
  EventsOn: vi.fn(() => () => {}),
  BrowserOpenURL: vi.fn(),
}));
vi.mock("../releasePage", () => ({ UPDATES_INSTALL_IN_APP: true }));

import { useReleaseVersions } from "../store/releaseVersions";
import { useUpdateCheck, type UpdateInfo } from "../store/updateCheck";
import { IDLE_UPDATE_INSTALL, useUpdateInstallState } from "../store/updateInstall";
import { SidebarFooterMore } from "./SidebarFooterMore";
import { SidebarUpdateCheckRow, UP_TO_DATE_MS } from "./SidebarUpdateCheckRow";

function release(latest: string): UpdateInfo {
  return {
    currentVersion: "0.7.66",
    latestVersion: latest,
    updateAvail: latest !== "0.7.66",
    channel: "stable",
    stableVersion: latest,
    rollbackAvail: false,
  };
}

let container: HTMLDivElement;
let root: Root;
const onUpdate = vi.fn();

const buttonWithText = (text: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as
    | HTMLButtonElement
    | undefined;
const checkRow = () =>
  buttonWithText("Check for updates") ??
  buttonWithText("Checking") ??
  buttonWithText("Up to date") ??
  buttonWithText("is out") ??
  buttonWithText("Couldn't check") ??
  buttonWithText("Updating");

function renderRow() {
  act(() => root.render(<SidebarUpdateCheckRow divider={false} onUpdate={onUpdate} />));
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.getVersion.mockResolvedValue("0.7.66");
  useReleaseVersions.setState({ app: "0.7.66", latest: "" });
  useUpdateCheck.setState({ info: null, checkedAt: 0 });
  useUpdateInstallState.setState(IDLE_UPDATE_INSTALL);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SidebarUpdateCheckRow", () => {
  it("checks in place, says lpm is up to date, then goes back to the plain row", async () => {
    vi.useFakeTimers();
    let answer: (info: UpdateInfo) => void = () => {};
    mocks.checkForUpdate.mockReturnValue(new Promise<UpdateInfo>((resolve) => (answer = resolve)));
    renderRow();

    act(() => checkRow()!.click());
    expect(checkRow()!.textContent).toBe("Checking…");
    expect(checkRow()!.disabled).toBe(true);

    await act(async () => answer(release("0.7.66")));
    expect(checkRow()!.textContent).toBe("Up to date0.7.66");

    act(() => vi.advanceTimersByTime(UP_TO_DATE_MS));
    expect(checkRow()!.textContent).toBe("Check for updates");
  });

  it("offers the release a check found, and hands its click to the update", async () => {
    mocks.checkForUpdate.mockResolvedValue(release("0.7.67"));
    renderRow();

    await act(async () => checkRow()!.click());
    expect(checkRow()!.textContent).toBe("0.7.67 is outUpdate");

    act(() => checkRow()!.click());
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it("offers what the background check already found, without a click", () => {
    useUpdateCheck.setState({ info: release("0.7.67"), checkedAt: 1 });
    renderRow();

    expect(checkRow()!.textContent).toBe("0.7.67 is outUpdate");
  });

  it("says it couldn't check, keeps the reason for hover, and tries again", async () => {
    mocks.checkForUpdate.mockRejectedValue("GitHub API returned status 403");
    renderRow();

    await act(async () => checkRow()!.click());
    expect(checkRow()!.textContent).toBe("Couldn't checkRetry");
    expect(checkRow()!.title).toBe("GitHub API returned status 403");

    mocks.checkForUpdate.mockResolvedValue(release("0.7.66"));
    await act(async () => checkRow()!.click());
    expect(mocks.checkForUpdate).toHaveBeenCalledTimes(2);
    expect(checkRow()!.textContent).toContain("Up to date");
  });

  it("can't be pressed while an update installs", () => {
    useUpdateInstallState.setState({ active: true, phase: "downloading" });
    renderRow();

    expect(checkRow()!.textContent).toBe("Updating…");
    expect(checkRow()!.disabled).toBe(true);
  });

  it("isn't offered in a development build", () => {
    mocks.getVersion.mockResolvedValue("dev");
    useReleaseVersions.setState({ app: "dev" });
    renderRow();

    expect(container.querySelector("button")).toBeNull();
  });
});

describe("SidebarFooterMore update check", () => {
  function renderMore() {
    act(() =>
      root.render(
        <SidebarFooterMore
          entries={[{ id: "stats", label: "Stats", icon: null, active: false, onSelect: vi.fn() }]}
          isDefault
          onMove={vi.fn()}
          onReset={vi.fn()}
          onUpdate={onUpdate}
        />,
      ),
    );
    act(() => buttonWithText("More")!.click());
  }

  it("sits below a divider and answers without closing the menu", async () => {
    mocks.checkForUpdate.mockResolvedValue(release("0.7.66"));
    renderMore();

    const row = checkRow()!;
    expect(row.previousElementSibling?.className).toContain("h-px");

    await act(async () => row.click());
    expect(buttonWithText("Stats")).toBeDefined();
    expect(checkRow()!.textContent).toContain("Up to date");
  });

  it("closes the menu when it starts the update", () => {
    useUpdateCheck.setState({ info: release("0.7.67"), checkedAt: 1 });
    renderMore();

    act(() => checkRow()!.click());
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(buttonWithText("Stats")).toBeUndefined();
  });
});
