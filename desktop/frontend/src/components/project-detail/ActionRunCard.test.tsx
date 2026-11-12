// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionRunCapture, ActionRunSnapshot } from "../../hooks/actionRunCapture";
import { ActionRunCard } from "./ActionRunCard";
import { RUN_CARD_AUTO_CLOSE_MS, RUN_STOPPED_ERROR } from "./runCardPlacement";

vi.mock("../../../bridge/runtime", () => ({ EventsOn: () => () => {} }));

function fakeRun() {
  let snap: ActionRunSnapshot = { lines: [], done: null };
  const watchers = new Set<() => void>();
  const run: ActionRunCapture = {
    snapshot: () => snap,
    subscribe: (cb) => {
      watchers.add(cb);
      return () => watchers.delete(cb);
    },
    dispose: () => {},
  };
  const update = (next: Partial<ActionRunSnapshot>) => {
    snap = { ...snap, ...next };
    act(() => watchers.forEach((w) => w()));
  };
  return { run, update };
}

let host: HTMLDivElement;
let root: Root;
let onClose: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.animate ??= (() => ({ cancel: () => {} })) as unknown as Element["animate"];
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  onClose = vi.fn<() => void>();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function mount(run: ActionRunCapture) {
  act(() =>
    root.render(
      <ActionRunCard
        label="Run Tests"
        runKey="saas-app/test"
        run={run}
        startedAt={Date.now()}
        onClose={onClose}
        onRunAgain={() => {}}
      />,
    ),
  );
}

const card = () => document.querySelector<HTMLElement>("[data-action-run-card]")!;

describe("ActionRunCard", () => {
  it("doesn't cover the app", () => {
    const { run } = fakeRun();
    mount(run);
    expect(card().dataset.runState).toBe("running");
    expect(document.querySelector(".inset-0")).toBeNull();
  });

  it("says how a pass went, then closes itself", () => {
    const { run, update } = fakeRun();
    mount(run);
    update({ lines: ["9 passed (9)"], done: { success: true }, endedAt: Date.now() + 1200 });
    expect(card().dataset.runState).toBe("passed");
    expect(card().textContent).toContain("Finished in 1.2 s");
    expect(card().textContent).toContain("9 passed (9)");

    act(() => vi.advanceTimersByTime(RUN_CARD_AUTO_CLOSE_MS));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays up while the pointer is on it", () => {
    const { run, update } = fakeRun();
    mount(run);
    update({ done: { success: true }, endedAt: Date.now() });
    act(() => card().dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body })));
    act(() => vi.advanceTimersByTime(RUN_CARD_AUTO_CLOSE_MS * 2));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps a failure up with its exit status", () => {
    const { run, update } = fakeRun();
    mount(run);
    update({ lines: ["1 failed"], done: { success: false, error: "exit status 1: 1 failed" }, endedAt: Date.now() });
    expect(card().dataset.runState).toBe("failed");
    expect(card().textContent).toContain("exit status 1");
    act(() => vi.advanceTimersByTime(RUN_CARD_AUTO_CLOSE_MS * 2));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("offers Stop while a stoppable run is going, and says it was stopped", () => {
    const { run, update } = fakeRun();
    const onStop = vi.fn<() => void>();
    act(() =>
      root.render(
        <ActionRunCard
          label="npm run dev"
          place={() => ({ top: 104, left: 600 })}
          run={run}
          startedAt={Date.now()}
          onClose={onClose}
          onRunAgain={() => {}}
          onStop={onStop}
        />,
      ),
    );
    expect(card().style.top).toBe("104px");
    const stop = [...card().querySelectorAll("button")].find((b) => b.textContent === "Stop")!;
    act(() => stop.click());
    expect(onStop).toHaveBeenCalledTimes(1);

    update({ done: { success: false, error: RUN_STOPPED_ERROR }, endedAt: Date.now() + 3000 });
    expect(card().dataset.runState).toBe("stopped");
    expect(card().textContent).toContain("Stopped after 3.0 s");
    expect(card().textContent).toContain("Run again");
    act(() => vi.advanceTimersByTime(RUN_CARD_AUTO_CLOSE_MS * 2));
    expect(onClose).not.toHaveBeenCalled();
  });
});
