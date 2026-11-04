// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHistoryPage, HistoryCommit } from "../gitHistory";

const bridge = vi.hoisted(() => ({ history: vi.fn() }));
const events = vi.hoisted(() => ({ emit: (_: unknown) => {} }));

vi.mock("../../bridge/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../bridge/commands")>()),
  GitHistory: (cwd: string, skip: number, limit: number) => bridge.history(cwd, skip, limit),
}));
vi.mock("../../bridge/runtime", () => ({
  EventsOn: (_name: string, handler: (payload: unknown) => void) => {
    events.emit = handler;
    return () => {};
  },
}));

import { useRecentCommits } from "./useRecentCommits";

const page = (...hashes: string[]) => ({ commits: hashes.map((hash) => ({ hash })), hasMore: false }) as GitHistoryPage;

let root: Root;
let seen: HistoryCommit[] = [];

function Probe({ path, active }: { path: string; active?: boolean }) {
  seen = useRecentCommits(path, active);
  return null;
}

const show = (path: string, active?: boolean) =>
  act(async () => {
    root.render(createElement(Probe, { path, active }));
  });

beforeEach(() => {
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
  vi.clearAllMocks();
});

describe("useRecentCommits", () => {
  it("asks for the newest three", async () => {
    bridge.history.mockResolvedValue(page("a", "b", "c"));
    await show("/one");
    expect(seen).toHaveLength(3);
    expect(bridge.history).toHaveBeenCalledWith("/one", 0, 3);
  });

  it("never shows one project's commits under another", async () => {
    bridge.history.mockResolvedValueOnce(page("one"));
    await show("/one");
    expect(seen.map((c) => c.hash)).toEqual(["one"]);

    let finish: (value: GitHistoryPage) => void = () => {};
    bridge.history.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    await show("/two");
    expect(seen).toEqual([]);

    await act(async () => finish(page("two")));
    expect(seen.map((c) => c.hash)).toEqual(["two"]);
  });

  it("reloads after a commit but not after an edit", async () => {
    bridge.history.mockResolvedValue(page("a"));
    await show("/one");
    expect(bridge.history).toHaveBeenCalledTimes(1);

    await act(async () => events.emit({ path: "/one", files: ["src/a.ts"] }));
    expect(bridge.history).toHaveBeenCalledTimes(1);

    await act(async () => events.emit({ path: "/one", files: null }));
    expect(bridge.history).toHaveBeenCalledTimes(2);
  });

  it("holds off while the project is hidden", async () => {
    bridge.history.mockResolvedValue(page("a"));
    await show("/one", false);
    expect(bridge.history).not.toHaveBeenCalled();
    await show("/one", true);
    expect(bridge.history).toHaveBeenCalledTimes(1);
  });
});
