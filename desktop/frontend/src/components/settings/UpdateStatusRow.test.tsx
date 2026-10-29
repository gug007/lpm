// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  install: vi.fn<() => Promise<void>>(),
  schedule: vi.fn<() => Promise<unknown>>(),
  cancelScheduled: vi.fn<() => Promise<boolean>>(),
  listeners: new Map<string, (payload: unknown) => void>(),
}));

vi.mock("../../../bridge/commands", () => ({
  InstallUpdate: bridge.install,
  RollbackUpdate: vi.fn(),
  CancelUpdate: vi.fn(() => Promise.resolve(true)),
  ScheduleUpdate: bridge.schedule,
  ScheduledUpdate: vi.fn(() => Promise.resolve(null)),
  CancelScheduledUpdate: bridge.cancelScheduled,
  CheckForUpdate: vi.fn(),
}));
vi.mock("../../../bridge/runtime", () => ({
  EventsOn: (name: string, cb: (payload: unknown) => void) => {
    bridge.listeners.set(name, cb);
    return () => bridge.listeners.delete(name);
  },
}));
vi.mock("../../releasePage", () => ({ UPDATES_INSTALL_IN_APP: true, openReleasePage: vi.fn() }));
vi.mock("../../store/app", () => {
  const state = { projects: [] };
  const useAppStore = Object.assign((select: (s: typeof state) => unknown) => select(state), {
    getState: () => state,
  });
  return { useAppStore };
});
vi.mock("../../store/globalAgentStatus", () => {
  const state = { entries: [] };
  const useGlobalAgentStatus = Object.assign((select: (s: typeof state) => unknown) => select(state), {
    getState: () => state,
  });
  return { useGlobalAgentStatus };
});

import { useUpdateCheck, type UpdateInfo } from "../../store/updateCheck";
import { IDLE_UPDATE_INSTALL, useUpdateInstallState } from "../../store/updateInstall";
import { useUpdateInstall } from "../useUpdateInstall";
import { UpdateStatusRow } from "./UpdateStatusRow";

let host: HTMLDivElement;
let root: Root;

function Harness({ version }: { version: string }) {
  const update = useUpdateInstall();
  return (
    <>
      <UpdateStatusRow version={version} update={update} />
      {update.dialogs}
    </>
  );
}

const info = (updateAvail: boolean): UpdateInfo => ({
  currentVersion: "0.7.31",
  latestVersion: updateAvail ? "0.7.32" : "0.7.31",
  updateAvail,
  channel: "stable",
  stableVersion: "0.7.31",
  rollbackAvail: false,
});

const text = () => document.body.textContent ?? "";
const button = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent === label || b.getAttribute("aria-label") === label,
  );
const click = async (target: Element | null | undefined) => {
  if (!target) throw new Error("no such button");
  await act(async () => (target as HTMLElement).click());
};
const emit = (name: string, payload: unknown) => act(() => bridge.listeners.get(name)?.(payload));
const render = async (version = "0.7.31") => {
  await act(async () => root.render(<Harness version={version} />));
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useUpdateInstallState.setState(IDLE_UPDATE_INSTALL);
  useUpdateCheck.setState({ info: null, checkedAt: 0 });
  bridge.install.mockReset().mockImplementation(() => new Promise<void>(() => {}));
  bridge.schedule.mockReset().mockResolvedValue({ version: "0.7.32", waiting: "1 agent in web" });
  bridge.cancelScheduled.mockReset().mockResolvedValue(true);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

describe("UpdateStatusRow", () => {
  it("offers the new version with What's new", async () => {
    useUpdateCheck.setState({ info: info(true), checkedAt: Math.floor(Date.now() / 1000) });
    await render();
    expect(text()).toContain("Updates");
    expect(text()).not.toContain("lpm 0.7.31");
    expect(text()).toContain("0.7.32 is available");
    expect(button("What's new")).toBeDefined();
  });

  it("waits for agents from the Update menu, and calls that off with Cancel", async () => {
    useUpdateCheck.setState({ info: info(true), checkedAt: 0 });
    await render();
    await click(button("When to update"));
    expect(text()).toContain("No agent is working, so it starts now");

    await click([...document.querySelectorAll('[role="menuitem"]')].find((b) => /When agents finish/.test(b.textContent ?? "")));
    expect(bridge.schedule).toHaveBeenCalledTimes(1);
    expect(bridge.install).not.toHaveBeenCalled();
    expect(text()).toContain("0.7.32 installs when agents finish · 1 agent in web");

    await click(button("Cancel"));
    expect(bridge.cancelScheduled).toHaveBeenCalledTimes(1);
    emit("update-scheduled", null);
    expect(text()).toContain("0.7.32 is available");
  });

  it("installs straight away from the button itself", async () => {
    useUpdateCheck.setState({ info: info(true), checkedAt: 0 });
    await render();
    await click(button("Update"));
    expect(bridge.install).toHaveBeenCalledTimes(1);
    emit("update-progress", 42);
    emit("update-status", "downloading");
    expect(text()).toContain("Downloading... 42%");
    expect(button("Cancel")).toBeDefined();
  });

  it("says when it last looked once up to date", async () => {
    useUpdateCheck.setState({ info: info(false), checkedAt: Math.floor(Date.now() / 1000) });
    await render();
    expect(text()).toContain("Up to date · checked just now");
    expect(button("Check now")).toBeDefined();
  });

  it("offers nothing in a development build", async () => {
    useUpdateCheck.setState({ info: info(true), checkedAt: 0 });
    await render("dev");
    expect(text()).toContain("Updates aren't available in development builds");
    expect(document.querySelectorAll("button")).toHaveLength(0);
  });
});
