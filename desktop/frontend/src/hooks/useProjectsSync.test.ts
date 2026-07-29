// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...data: unknown[]) => void>(),
  refreshProjects: vi.fn(),
  refreshTemplates: vi.fn(),
  refreshDetached: vi.fn(),
  rehydrateSidebarLayout: vi.fn(),
}));

vi.mock("../../bridge/runtime", () => ({
  EventsOn: (eventName: string, callback: (...data: unknown[]) => void) => {
    mocks.handlers.set(eventName, callback);
    return () => mocks.handlers.delete(eventName);
  },
}));

vi.mock("../store/app", () => ({
  useAppStore: {
    getState: () => ({
      refreshProjects: mocks.refreshProjects,
      refreshTemplates: mocks.refreshTemplates,
      refreshDetached: mocks.refreshDetached,
      rehydrateSidebarLayout: mocks.rehydrateSidebarLayout,
    }),
  },
}));

const { useProjectsSync } = await import("./useProjectsSync");

let container: HTMLDivElement;
let root: Root;

function emit(eventName: string) {
  act(() => mocks.handlers.get(eventName)?.());
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.handlers.clear();
  mocks.refreshProjects.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      createElement(function Harness() {
        useProjectsSync();
        return null;
      }),
    ),
  );
  mocks.refreshProjects.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("useProjectsSync", () => {
  it("coalesces a burst of status-changed events into one refresh", () => {
    for (let i = 0; i < 5; i++) emit("status-changed");
    act(() => void vi.advanceTimersByTime(250));
    expect(mocks.refreshProjects).toHaveBeenCalledTimes(1);
  });

  it("does not drop the final event of a burst", () => {
    emit("status-changed");
    act(() => void vi.advanceTimersByTime(240));
    expect(mocks.refreshProjects).not.toHaveBeenCalled();
    emit("status-changed");
    act(() => void vi.advanceTimersByTime(240));
    expect(mocks.refreshProjects).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(10));
    expect(mocks.refreshProjects).toHaveBeenCalledTimes(1);
  });

  it("leaves projects-changed undebounced", () => {
    emit("projects-changed");
    expect(mocks.refreshProjects).toHaveBeenCalledTimes(1);
  });

  it("does not refresh after teardown", () => {
    emit("status-changed");
    act(() => root.unmount());
    act(() => void vi.advanceTimersByTime(1000));
    expect(mocks.refreshProjects).not.toHaveBeenCalled();
    root = createRoot(container);
  });
});
