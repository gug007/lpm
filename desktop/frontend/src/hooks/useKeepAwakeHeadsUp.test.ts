// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown) => void>(),
  keepAwakeSet: vi.fn(),
  peerInvoke: vi.fn(),
  warning: vi.fn(),
  dismiss: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../bridge/commands", () => ({
  KeepAwakeSet: mocks.keepAwakeSet,
  PeerInvoke: mocks.peerInvoke,
}));
vi.mock("../../bridge/runtime", () => ({
  EventsOn: (name: string, handler: (payload: unknown) => void) => {
    mocks.handlers.set(name, handler);
    return () => {
      if (mocks.handlers.get(name) === handler) mocks.handlers.delete(name);
    };
  },
}));
vi.mock("../notifications/toast", () => ({
  toast: { warning: mocks.warning, dismiss: mocks.dismiss, error: mocks.error },
}));

import { MACHINE } from "../machineWords";
import { useKeepAwakeHeadsUp } from "./useKeepAwakeHeadsUp";

const MIN = 60_000;
let host: HTMLDivElement;
let root: Root;

function Harness() {
  useKeepAwakeHeadsUp();
  return null;
}

const emit = (name: string, payload: unknown) => act(() => mocks.handlers.get(name)?.(payload));
const lastToast = () => mocks.warning.mock.calls.at(-1)!;
const state = (endsIn: number | null) => ({ mode: endsIn === null ? "off" : "timed", endsIn });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.handlers.clear();
  mocks.keepAwakeSet.mockResolvedValue({});
  mocks.peerInvoke.mockResolvedValue({});
  host = document.createElement("div");
  root = createRoot(host);
  act(() => root.render(createElement(Harness)));
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useKeepAwakeHeadsUp", () => {
  it("offers this machine an hour more", () => {
    emit("keep-awake-heads-up", { reason: "timed", endsIn: 5 * MIN });

    const [title, options] = lastToast();
    expect(title).toBe(`${MACHINE.ThisMachine} can sleep in 5 min`);
    expect(options.description).toBe("The time you set is running out.");
    expect(options.event).toBe("keepAwake");
    expect(options.cancel.label).toBe("Let it sleep");
    options.action.onClick();
    expect(mocks.keepAwakeSet).toHaveBeenCalledWith("extend", 60);
  });

  it("goes once the end moves or passes, not while it stands", () => {
    emit("keep-awake-heads-up", { reason: "timed", endsIn: 5 * MIN });
    const { id } = lastToast()[1];

    emit("keep-awake-changed", state(5 * MIN - 1_000));
    expect(mocks.dismiss).not.toHaveBeenCalled();
    emit("keep-awake-changed", state(65 * MIN));
    expect(mocks.dismiss).toHaveBeenCalledWith(id);

    emit("keep-awake-heads-up", { reason: "agents", endsIn: 5 * MIN });
    emit("keep-awake-changed", state(null));
    expect(mocks.dismiss).toHaveBeenCalledTimes(2);
  });

  it("offers a connected computer an hour more, by name", () => {
    emit("peer-keep-awake-heads-up", { slug: "studio", machine: "Studio", reason: "agents", endsIn: 5 * MIN });

    const [title, options] = lastToast();
    expect(title).toBe("Studio can sleep in 5 min");
    options.action.onClick();
    expect(mocks.peerInvoke).toHaveBeenCalledWith("studio", "keep_awake_set", { mode: "extend", minutes: 60 });
    expect(mocks.keepAwakeSet).not.toHaveBeenCalled();
  });

  it("follows the connected computer's own changes", () => {
    emit("peer-keep-awake-heads-up", { slug: "studio", machine: "Studio", reason: "timed", endsIn: 5 * MIN });
    const { id } = lastToast()[1];

    emit("keep-awake-changed", state(null));
    expect(mocks.dismiss).not.toHaveBeenCalled();
    emit("peer-evt-studio", { name: "keep-awake-changed", payload: state(null) });
    expect(mocks.dismiss).toHaveBeenCalledWith(id);
  });
});
