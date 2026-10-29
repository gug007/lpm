// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AIGeneration } from "./useAIGeneration";
import type { AIPicker } from "./useAIPicker";

const bridge = vi.hoisted(() => ({
  split: vi.fn(),
  commit: vi.fn(),
  merge: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../bridge/commands", () => ({
  GenerateCommitSplit: bridge.split,
  GitCommit: bridge.commit,
  GitMergeState: bridge.merge,
  GitPush: bridge.push,
}));
vi.mock("../notifications/toast", () => ({
  toast: Object.assign(bridge.toast, { success: bridge.success, error: bridge.error }),
}));
vi.mock("../store/settings", () => ({ getSettings: () => ({}) }));

import { useCommitSplit, type CommitSplit } from "./useCommitSplit";

const gen = { run: (fn: (id: string) => Promise<unknown>) => fn("gen-1") } as unknown as AIGeneration;
const ai = {
  selectedCLI: "claude",
  selectedModel: "",
  selectedEffort: "",
  selectedFast: false,
} as unknown as AIPicker;

let root: Root;
let host: HTMLDivElement;
let split: CommitSplit;

function Harness() {
  split = useCommitSplit("api", "/p/api", gen, ai);
  return null;
}

const TWO = [
  { message: "feat: a", files: ["a.ts"] },
  { message: "chore: b", files: ["b.json"] },
];

beforeEach(() => {
  Object.values(bridge).forEach((fn) => fn.mockReset());
  bridge.merge.mockResolvedValue({ merging: false, source: "", files: [] });
  bridge.commit.mockResolvedValue(undefined);
  bridge.push.mockResolvedValue(undefined);
  host = document.createElement("div");
  root = createRoot(host);
  act(() => root.render(<Harness />));
});

afterEach(() => act(() => root.unmount()));

describe("useCommitSplit", () => {
  it("shows the groups the AI proposes", async () => {
    bridge.split.mockResolvedValue(TWO);
    await act(() => split.plan(["a.ts", "b.json"], "", vi.fn()));
    expect(bridge.split.mock.calls[0]).toEqual(["api", "/p/api", "claude", "", "", false, ["a.ts", "b.json"], "", "gen-1"]);
    expect(split.groups).toEqual(TWO);
  });

  it("fills the plain commit's message when the changes are one topic", async () => {
    bridge.split.mockResolvedValue([{ message: "fix: one thing", files: ["a.ts", "b.ts"] }]);
    const onSingle = vi.fn();
    await act(() => split.plan(["a.ts", "b.ts"], "", onSingle));
    expect(onSingle).toHaveBeenCalledWith("fix: one thing");
    expect(split.groups).toBeNull();
  });

  it("refuses to split a merge", async () => {
    bridge.merge.mockResolvedValue({ merging: true, source: "main", files: [] });
    await act(() => split.plan(["a.ts", "b.ts"], "", vi.fn()));
    expect(bridge.split).not.toHaveBeenCalled();
    expect(bridge.error).toHaveBeenCalledWith("Finish the merge first. A merge commit can't be split.");
  });

  it("commits each group in order", async () => {
    act(() => split.setGroups(TWO));
    let done = false;
    await act(async () => {
      done = await split.commitAll(false);
    });
    expect(done).toBe(true);
    expect(bridge.commit.mock.calls).toEqual([
      ["/p/api", "feat: a", ["a.ts"]],
      ["/p/api", "chore: b", ["b.json"]],
    ]);
    expect(bridge.success).toHaveBeenCalledWith("Committed 2 commits");
  });

  it("keeps the groups that didn't land when one fails", async () => {
    bridge.commit.mockResolvedValueOnce(undefined).mockRejectedValueOnce("hook failed");
    act(() => split.setGroups(TWO));
    let done = true;
    await act(async () => {
      done = await split.commitAll(false);
    });
    expect(done).toBe(false);
    expect(split.groups).toEqual([TWO[1]]);
    expect(bridge.error).toHaveBeenCalledWith("Committed 1 of 2. The next commit failed: hook failed");
  });

  it("says the commits landed when only the push fails", async () => {
    bridge.push.mockRejectedValue("rejected");
    act(() => split.setGroups(TWO));
    let done = false;
    await act(async () => {
      done = await split.commitAll(true);
    });
    expect(done).toBe(true);
    expect(bridge.error).toHaveBeenCalledWith("Committed 2 commits, but the push failed: rejected");
  });
});
