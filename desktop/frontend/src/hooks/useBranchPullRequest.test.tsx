// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GIT_CHANGED_EVENT, type PullRequestInfo } from "../types";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn<(cwd: string) => Promise<unknown>>(),
  listeners: new Map<string, (payload: unknown) => void>(),
}));

vi.mock("../../bridge/commands", () => ({
  BranchPullRequest: (cwd: string) => mocks.lookup(cwd),
}));
vi.mock("../../bridge/runtime", () => ({
  EventsOn: (name: string, cb: (payload: unknown) => void) => {
    mocks.listeners.set(name, cb);
    return () => mocks.listeners.delete(name);
  },
}));

import { useBranchPr } from "../store/branchPr";
import { FRESH_MS, GIT_CHANGE_DELAY_MS, POLL_MS, useBranchPullRequest } from "./useBranchPullRequest";

const PR: PullRequestInfo = {
  number: 9,
  url: "https://github.com/o/r/pull/9",
  state: "OPEN",
  title: "Nine",
  isDraft: false,
};

let container: HTMLDivElement;
let root: Root;

function Probe({ branch, active = true }: { branch: string; active?: boolean }) {
  const pr = useBranchPullRequest("/p", branch, active);
  return <div id="out">{pr ? `#${pr.number}` : "none"}</div>;
}

function render(branch: string, active = true) {
  act(() => root.render(<Probe branch={branch} active={active} />));
}

const out = () => container.querySelector("#out")!.textContent;

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function gitChanged(files: string[] | null) {
  act(() => mocks.listeners.get(GIT_CHANGED_EVENT)?.({ path: "/p", files }));
}

beforeEach(() => {
  vi.useFakeTimers();
  useBranchPr.setState({ entries: {} });
  mocks.lookup.mockReset();
  mocks.lookup.mockResolvedValue(PR);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("useBranchPullRequest", () => {
  it("looks the branch up on mount and shows what gh reports", async () => {
    render("feat");
    expect(out()).toBe("none");
    await flush();
    expect(mocks.lookup).toHaveBeenCalledWith("/p");
    expect(out()).toBe("#9");
  });

  it("forgets the PR the moment the branch changes and asks again", async () => {
    render("feat");
    await flush();
    mocks.lookup.mockResolvedValue(null);
    render("other");
    expect(out()).toBe("none");
    await flush();
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(out()).toBe("none");
  });

  it("skips the lookup for a detached or unknown branch", async () => {
    render("");
    await flush();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("re-asks after a git metadata change, but not after a working-tree edit", async () => {
    render("feat");
    await flush();
    gitChanged(["src/a.ts"]);
    await act(async () => {
      vi.advanceTimersByTime(GIT_CHANGE_DELAY_MS);
    });
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    gitChanged(null);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(GIT_CHANGE_DELAY_MS);
    });
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
  });

  it("treats a window focus as a refresh only once the last answer is stale", async () => {
    render("feat");
    await flush();
    act(() => window.dispatchEvent(new Event("focus")));
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(FRESH_MS);
    act(() => window.dispatchEvent(new Event("focus")));
    await flush();
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
  });

  it("polls while active and stops when the pane leaves the screen", async () => {
    render("feat");
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
    });
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    render("feat", false);
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS * 3);
    });
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
  });

  it("shows nothing when the lookup fails", async () => {
    mocks.lookup.mockRejectedValue(new Error("no gh"));
    render("feat");
    await flush();
    expect(out()).toBe("none");
  });
});
