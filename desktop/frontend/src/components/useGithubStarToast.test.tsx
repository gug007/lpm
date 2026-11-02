// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  browserOpenURL: vi.fn(),
  githubStarred: vi.fn(),
}));

vi.mock("../notifications/toast", () => ({ toast: mocks.toast }));
vi.mock("../../bridge/runtime", () => ({ BrowserOpenURL: mocks.browserOpenURL }));
vi.mock("../../bridge/commands", () => ({ GithubStarred: mocks.githubStarred }));

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

async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

function start(settings: Partial<Settings>) {
  useSettingsStore.setState({ ...settings, update } as never);
  act(() => root.render(<Probe />));
}

beforeEach(() => {
  vi.useFakeTimers();
  // A Thursday, past the days the weekly recap toast has to itself.
  vi.setSystemTime(new Date(2026, 9, 29, 12));
  mocks.githubStarred.mockResolvedValue(false);
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
  useSettingsStore.setState({
    githubStarSince: undefined,
    githubStarAsked: undefined,
    githubStarred: undefined,
  });
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useGithubStarToast", () => {
  it("only notes the first day it sees lpm", async () => {
    start({});
    await advance(MINUTE);

    expect(update).toHaveBeenCalledWith({ githubStarSince: "2026-10-29" });
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("asks once a week later, and never again", async () => {
    start({ githubStarSince: "2026-10-22" });
    await advance(MINUTE);

    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ githubStarAsked: true });
    const [, options] = mocks.toast.mock.calls[0];
    options.action.onClick();
    expect(mocks.browserOpenURL).toHaveBeenCalledWith("https://github.com/gug007/lpm");

    await advance(3 * HOUR);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it("remembers a star already given on GitHub and never asks", async () => {
    mocks.githubStarred.mockResolvedValue(true);
    start({ githubStarSince: "2026-10-22" });
    await advance(MINUTE + 3 * HOUR);

    expect(update).toHaveBeenCalledWith({ githubStarred: true });
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.githubStarred).toHaveBeenCalledTimes(1);
  });

  it("still asks when the star can't be checked", async () => {
    mocks.githubStarred.mockRejectedValue(new Error("no gh"));
    start({ githubStarSince: "2026-10-22" });
    await advance(MINUTE);

    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it("waits while lpm is under a week old", async () => {
    start({ githubStarSince: "2026-10-23" });
    await advance(MINUTE + HOUR);

    expect(mocks.toast).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
