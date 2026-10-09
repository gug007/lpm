// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STATUS_RUNNING, type ProjectInfo } from "../types";

const bridge = vi.hoisted(() => ({
  install: vi.fn<() => Promise<void>>(),
  cancel: vi.fn<() => Promise<boolean>>(),
  listeners: new Map<string, (payload: unknown) => void>(),
  projects: [] as ProjectInfo[],
}));

vi.mock("../../bridge/commands", () => ({
  InstallUpdate: bridge.install,
  CancelUpdate: bridge.cancel,
}));
vi.mock("../../bridge/runtime", () => ({
  EventsOn: (name: string, cb: (payload: unknown) => void) => {
    bridge.listeners.set(name, cb);
    return () => bridge.listeners.delete(name);
  },
}));
vi.mock("../releasePage", () => ({ UPDATES_INSTALL_IN_APP: true }));
vi.mock("../store/app", () => ({
  useAppStore: { getState: () => ({ projects: bridge.projects }) },
}));
vi.mock("../store/globalAgentStatus", () => ({
  useGlobalAgentStatus: { getState: () => ({ entries: [] }) },
}));

import { IDLE_UPDATE_INSTALL, useUpdateInstallState } from "../store/updateInstall";
import { SidebarUpdateRow } from "./SidebarUpdateRow";
import { useUpdateInstall } from "./useUpdateInstall";

let host: HTMLDivElement;
let root: Root;
let settleInstall: { resolve: () => void; reject: (err: unknown) => void };

function Harness() {
  const update = useUpdateInstall();
  return (
    <>
      <SidebarUpdateRow currentVersion="0.6.15" latestVersion="0.6.16" update={update} onUpdate={update.request} />
      {update.dialogs}
    </>
  );
}

const button = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent === label || b.getAttribute("aria-label") === label,
  );
const row = () => document.querySelector<HTMLButtonElement>('button[title="Update to 0.6.16"]');
const text = () => document.body.textContent ?? "";

const click = async (target: HTMLButtonElement | null | undefined) => {
  if (!target) throw new Error("no such button");
  await act(async () => target.click());
};

const emit = (name: string, payload: unknown) => act(() => bridge.listeners.get(name)?.(payload));

const busyProject = (): ProjectInfo => ({
  name: "api",
  session: "api",
  root: "/Users/dev/api",
  running: true,
  services: [],
  allServices: [],
  actions: [],
  profiles: [],
  activeProfile: "",
  isRemote: false,
  statusEntries: [
    { key: "claude_code_a", value: STATUS_RUNNING, priority: 0, timestamp: Date.now(), paneID: "%1" },
  ],
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useUpdateInstallState.setState(IDLE_UPDATE_INSTALL);
  bridge.projects = [];
  bridge.install.mockReset().mockImplementation(
    () => new Promise<void>((resolve, reject) => (settleInstall = { resolve, reject })),
  );
  bridge.cancel.mockReset().mockResolvedValue(true);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

describe("useUpdateInstall with the sidebar row", () => {
  it("shows the running version beside the new one", () => {
    expect(row()?.textContent).toBe("0.6.150.6.16Update");
  });

  it("installs straight away when no agent is mid-task, with progress in the row", async () => {
    await click(row());
    expect(bridge.install).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Downloading 0.6.16");
    expect(button("Cancel update")).toBeDefined();
  });

  it("asks first when an agent is running, and installs only once confirmed", async () => {
    bridge.projects = [busyProject()];
    await click(row());
    expect(bridge.install).not.toHaveBeenCalled();
    expect(text()).toContain("An agent is still running");
    expect(text()).toContain("api");

    await click(button("Update anyway"));
    expect(bridge.install).toHaveBeenCalledTimes(1);
    expect(text()).not.toContain("An agent is still running");
  });

  it("does nothing when the warning is dismissed", async () => {
    bridge.projects = [busyProject()];
    await click(row());
    await click(button("Cancel"));
    expect(bridge.install).not.toHaveBeenCalled();
    expect(row()).not.toBeNull();
  });

  it("fills the row as the download progresses, and cancels without an error", async () => {
    await click(row());
    emit("update-status", "downloading");
    emit("update-progress", 40);
    expect(text()).toContain("40%");
    expect(document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("40");

    await click(button("Cancel update"));
    expect(bridge.cancel).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Cancelling...");
    expect(button("Cancel update")).toBeUndefined();

    await act(async () => settleInstall.resolve());
    expect(row()).not.toBeNull();
    expect(text()).not.toContain("Update failed");
  });

  it("offers no cancel once the app is being replaced", async () => {
    await click(row());
    emit("update-status", "installing");
    expect(text()).toContain("Installing 0.6.16");
    expect(button("Cancel update")).toBeUndefined();
  });

  it("keeps going when the cancel came too late", async () => {
    bridge.cancel.mockResolvedValue(false);
    await click(row());
    emit("update-status", "downloading");
    await click(button("Cancel update"));
    expect(text()).toContain("Downloading 0.6.16");
    expect(button("Cancel update")).toBeDefined();
  });

  it("shows a failed install in the row, with Retry and Dismiss", async () => {
    await click(row());
    await act(async () => settleInstall.reject("download returned status 404"));
    expect(text()).toContain("Update failed");
    expect(text()).toContain("download returned status 404");

    await click(button("Retry"));
    expect(bridge.install).toHaveBeenCalledTimes(2);
    await act(async () => settleInstall.reject("download returned status 404"));

    await click(button("Dismiss"));
    expect(text()).not.toContain("Update failed");
    expect(row()).not.toBeNull();
  });
});
