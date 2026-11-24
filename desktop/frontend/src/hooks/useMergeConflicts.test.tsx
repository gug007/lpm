// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MergeState } from "../mergeConflicts";

const bridge = vi.hoisted(() => ({ state: vi.fn(), stop: vi.fn() }));
vi.mock("../../bridge/commands", () => ({
  GitMergeState: bridge.state,
  GitStopConflictAI: bridge.stop,
  GitMergeConflicts: vi.fn(),
  GitContinueMerge: vi.fn(),
  GitMarkConflictResolved: vi.fn(),
  GitTakeConflictSide: vi.fn(),
}));
vi.mock("./useGitChanged", () => ({ useGitChanged: () => {} }));
vi.mock("../notifications/toast", () => ({ toast: { error: vi.fn() } }));

import { useMergeConflicts, type MergeConflicts } from "./useMergeConflicts";

const at = (resolving?: { line: string }): MergeState => ({
  merging: true,
  source: "feat/x",
  files: [{ path: "a.ts", conflicts: 1, firstLine: 3, resolved: false }],
  resolving,
});

let container: HTMLDivElement;
let root: Root;
let conflicts: MergeConflicts;

function Probe() {
  conflicts = useMergeConflicts("/tmp/web", true);
  return null;
}

const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  bridge.state.mockReset();
  bridge.stop.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  root = createRoot(container);
  bridge.state.mockResolvedValue(at({ line: "Editing a.ts" }));
  await act(async () => root.render(<Probe />));
  await act(async () => void (await conflicts.reload()));
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe("an AI run started elsewhere", () => {
  it("is followed until it ends", async () => {
    expect(conflicts.state?.resolving?.line).toBe("Editing a.ts");
    bridge.state.mockResolvedValue(at({ line: "Running tests" }));
    await tick(2000);
    expect(conflicts.state?.resolving?.line).toBe("Running tests");
    bridge.state.mockResolvedValue(at());
    await tick(2000);
    expect(conflicts.state?.resolving).toBeUndefined();
    const asked = bridge.state.mock.calls.length;
    await tick(10_000);
    expect(bridge.state.mock.calls.length).toBe(asked);
  });

  it("can be stopped", async () => {
    bridge.state.mockResolvedValue(at());
    await act(async () => void (await conflicts.stopAI()));
    expect(bridge.stop).toHaveBeenCalledWith("/tmp/web");
    expect(conflicts.state?.resolving).toBeUndefined();
  });
});
