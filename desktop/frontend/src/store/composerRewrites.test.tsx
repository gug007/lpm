// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transformText = vi.hoisted(() => vi.fn());
const cancelAIGenerate = vi.hoisted(() => vi.fn(async () => true));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("../../bridge/commands", () => ({
  TransformText: (...args: unknown[]) => transformText(...args),
  CancelAIGenerate: cancelAIGenerate,
}));
vi.mock("../notifications/toast", () => ({ toast: { error: toastError } }));
vi.mock("./settings", () => ({ getSettings: () => ({}) }));

import type { AIPicker } from "../hooks/useAIPicker";
import type { ComposerAction } from "./composerActions";
import {
  composerRewriteOf,
  endComposerRewrite,
  startComposerRewrite,
  useComposerRewrite,
  type ComposerRewrite,
  type RewriteRequest,
} from "./composerRewrites";

const ai = { selectedCLI: "claude", selectedModel: "", selectedEffort: "", selectedFast: false } as AIPicker;
const action: ComposerAction = { id: "improve", icon: "sparkles", label: "Improve prompt", instruction: "Improve", enabled: true };

function request(over: Partial<RewriteRequest> = {}): RewriteRequest {
  return { projectName: "web", cwd: "/web", ai, action, value: "fix teh bug", count: 1, promptId: "p1", images: { "1": "/a.png" }, ...over };
}

// A TransformText call that stays in flight until the test answers it.
function pendingRun() {
  let resolve!: (text: string) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  transformText.mockReturnValueOnce(promise);
  return { resolve, reject };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

let key = 0;
let tab = "";
beforeEach(() => {
  tab = `tab-${++key}`;
  transformText.mockReset();
  cancelAIGenerate.mockClear();
  toastError.mockClear();
});

describe("a rewrite with no composer holding it", () => {
  it("keeps the answer for the composer to take, once", async () => {
    const run = pendingRun();
    startComposerRewrite(tab, request());
    run.resolve("  Fix the bug  ");
    await settle();
    expect(endComposerRewrite(tab)).toEqual({
      label: "Improve prompt",
      promptId: "p1",
      images: { "1": "/a.png" },
      outcome: { kind: "text", text: "Fix the bug" },
      stop: expect.any(Function),
    });
    expect(endComposerRewrite(tab)).toBeNull();
    expect(cancelAIGenerate).not.toHaveBeenCalled();
  });

  it("keeps several rewrites to choose from", async () => {
    transformText.mockResolvedValueOnce("one").mockResolvedValueOnce("two");
    startComposerRewrite(tab, request({ count: 2 }));
    await settle();
    expect(endComposerRewrite(tab)?.outcome).toEqual({ kind: "variants", list: ["one", "two"] });
  });

  it("ends with nothing to apply when it is stopped, without an error", async () => {
    const run = pendingRun();
    startComposerRewrite(tab, request());
    composerRewriteOf(tab)?.stop();
    expect(cancelAIGenerate).toHaveBeenCalledWith(transformText.mock.calls[0][8]);
    run.resolve("too late");
    await settle();
    expect(endComposerRewrite(tab)?.outcome).toEqual({ kind: "none" });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("reports a failure and ends with nothing to apply", async () => {
    const run = pendingRun();
    startComposerRewrite(tab, request());
    run.reject(new Error("claude failed"));
    await settle();
    expect(toastError).toHaveBeenCalledWith("Action failed: Error: claude failed");
    expect(endComposerRewrite(tab)?.outcome).toEqual({ kind: "none" });
  });

  it("stops the AI when its tab is closed mid-run, and drops the late answer", async () => {
    const run = pendingRun();
    startComposerRewrite(tab, request());
    expect(endComposerRewrite(tab)?.outcome).toBeNull();
    expect(cancelAIGenerate).toHaveBeenCalledWith(transformText.mock.calls[0][8]);
    run.resolve("too late");
    await settle();
    expect(endComposerRewrite(tab)).toBeNull();
  });

  it("marks a paired machine's run, so stopping it reaches that machine", () => {
    pendingRun();
    startComposerRewrite(tab, request({ projectName: "peer-0123abcd-web" }));
    expect(transformText.mock.calls[0][8]).toMatch(/^peer-0123abcd-[0-9a-f-]{36}$/);
    endComposerRewrite(tab);
  });

  it("doesn't start a second rewrite over one in flight", () => {
    pendingRun();
    startComposerRewrite(tab, request());
    startComposerRewrite(tab, request({ value: "another" }));
    expect(transformText).toHaveBeenCalledTimes(1);
    endComposerRewrite(tab);
  });
});

describe("useComposerRewrite", () => {
  let container: HTMLDivElement;
  let root: Root;
  let seen: ComposerRewrite | null;

  function Composer({ tabKey }: { tabKey: string }) {
    seen = useComposerRewrite(tabKey);
    return null;
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    root = createRoot(container);
    seen = null;
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it("hands a composer that mounts later the rewrite still running, then its answer", async () => {
    const run = pendingRun();
    startComposerRewrite(tab, request());
    act(() => root.render(<Composer tabKey={tab} />));
    expect(seen).toMatchObject({ promptId: "p1", outcome: null });
    await act(async () => {
      run.resolve("Fix the bug");
      await settle();
    });
    expect(seen?.outcome).toEqual({ kind: "text", text: "Fix the bug" });
    act(() => void endComposerRewrite(tab));
    expect(seen).toBeNull();
  });

  it("keeps another tab's rewrite out of this one", () => {
    pendingRun();
    startComposerRewrite(tab, request());
    act(() => root.render(<Composer tabKey="some-other-tab" />));
    expect(seen).toBeNull();
    endComposerRewrite(tab);
  });
});
