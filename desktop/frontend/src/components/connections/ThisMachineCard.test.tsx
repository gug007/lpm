// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeerHostState } from "../../peer/usePeerState";
import { DEFAULT_TAILNET_STATE } from "../../tailnetStatus";

const mocks = vi.hoisted(() => ({
  remote: { keepAwake: false, keepAwakeStatus: "off" },
  listeners: new Map<string, () => void>(),
  remoteState: vi.fn(),
  setKeepAwake: vi.fn(),
}));

vi.mock("../../../bridge/commands", () => ({
  PeerHostSetConfig: vi.fn(() => Promise.resolve()),
  RemoteState: mocks.remoteState,
  RemoteSetKeepAwake: mocks.setKeepAwake,
}));

vi.mock("../../../bridge/runtime", () => ({
  BrowserOpenURL: vi.fn(),
  EventsOn: (name: string, cb: () => void) => {
    mocks.listeners.set(name, cb);
    return () => mocks.listeners.delete(name);
  },
}));

vi.mock("../../hooks/useTailnetState", () => ({
  useTailnetState: () => ({
    state: DEFAULT_TAILNET_STATE,
    loaded: true,
    busy: null,
    failure: null,
    opened: false,
    signIn: vi.fn(),
  }),
}));

const { ThisMachineCard } = await import("./ThisMachineCard");

const host = (over: Partial<PeerHostState> = {}): PeerHostState => ({
  enabled: true,
  port: 8766,
  running: true,
  guestsOnly: false,
  hostId: "h1",
  lanHost: "10.0.0.2",
  pairing: null,
  devices: [],
  pairRequests: [],
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const render = async (h: PeerHostState) => {
  await act(async () => {
    root.render(<ThisMachineCard host={h} refresh={() => Promise.resolve()} peersOverTailscale={false} />);
  });
};

const keepAwakeSwitch = () => container.querySelector<HTMLButtonElement>('[aria-label^="Keep "][aria-label$=" awake"]');
const keepAwakeRow = () => container.querySelector('[data-settings-row="connections.keepAwake"]');

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mocks.remote = { keepAwake: false, keepAwakeStatus: "off" };
  mocks.listeners.clear();
  mocks.remoteState.mockImplementation(() => Promise.resolve({ ...mocks.remote }));
  mocks.setKeepAwake.mockImplementation((on: boolean) => {
    mocks.remote = { keepAwake: on, keepAwakeStatus: on ? "awake" : "off" };
    return Promise.resolve({ ...mocks.remote });
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ThisMachineCard keep awake", () => {
  it("offers the shared switch while Allow control is on", async () => {
    await render(host());
    expect(keepAwakeRow()).not.toBeNull();
    expect(keepAwakeSwitch()).not.toBeNull();

    await act(async () => keepAwakeSwitch()!.click());
    expect(mocks.setKeepAwake).toHaveBeenCalledWith(true);
    expect(container.textContent).toContain("Awake · plugged in");
  });

  it("hides it while Allow control is off", async () => {
    await render(host({ enabled: false, running: false }));
    expect(keepAwakeRow()).toBeNull();
    expect(container.textContent).not.toContain("may sleep");
  });

  it("says why a change wasn't saved and puts the switch back", async () => {
    await render(host());
    mocks.setKeepAwake.mockImplementationOnce(() =>
      Promise.reject("the mobile settings file at /x/remote.json is damaged, so nothing was changed"),
    );

    await act(async () => keepAwakeSwitch()!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "That change wasn't saved. The mobile settings file at /x/remote.json is damaged, so nothing was changed.",
    );
    expect(container.textContent).toContain("This Mac may sleep");
  });

  it("follows a change made in the Phone pane", async () => {
    await render(host());
    expect(container.textContent).toContain("This Mac may sleep");

    mocks.remote = { keepAwake: true, keepAwakeStatus: "battery" };
    await act(async () => mocks.listeners.get("remote-devices-changed")?.());
    expect(container.textContent).toContain("This Mac stays awake");
    expect(container.textContent).toContain("On battery");
  });
});
