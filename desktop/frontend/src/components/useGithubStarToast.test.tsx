// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  browserOpenURL: vi.fn(),
}));

vi.mock("../notifications/toast", () => ({ toast: mocks.toast }));
vi.mock("../../bridge/runtime", () => ({ BrowserOpenURL: mocks.browserOpenURL }));

import { useSettingsStore, type Settings } from "../store/settings";
import { useGithubStarToast } from "./useGithubStarToast";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

let container: HTMLDivElement;
let root: Root;
let update: ReturnType<typeof vi.fn>;

function Probe() {
  useGithubStarToast();
  return null;
}

function start(settings: Partial<Settings>) {
  useSettingsStore.setState({ ...settings, update } as never);
  act(() => root.render(<Probe />));
}

beforeEach(() => {
  vi.useFakeTimers();
  // A Thursday, past the days the weekly recap toast has to itself.
  vi.setSystemTime(new Date(2026, 9, 29, 12));
  update = vi.fn(async (partial: Partial<Settings>) => {
    useSettingsStore.setState(partial);
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useSettingsStore.setState({ githubStarSince: undefined, githubStarAsked: undefined });
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useGithubStarToast", () => {
  it("only notes the first day it sees lpm", () => {
    start({});
    act(() => vi.advanceTimersByTime(MINUTE));

    expect(update).toHaveBeenCalledWith({ githubStarSince: "2026-10-29" });
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("asks once a week later, and never again", () => {
    start({ githubStarSince: "2026-10-22" });
    act(() => vi.advanceTimersByTime(MINUTE));

    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ githubStarAsked: true });
    const [, options] = mocks.toast.mock.calls[0];
    options.action.onClick();
    expect(mocks.browserOpenURL).toHaveBeenCalledWith("https://github.com/gug007/lpm");

    act(() => vi.advanceTimersByTime(3 * HOUR));
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it("waits while lpm is under a week old", () => {
    start({ githubStarSince: "2026-10-23" });
    act(() => vi.advanceTimersByTime(MINUTE + HOUR));

    expect(mocks.toast).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
