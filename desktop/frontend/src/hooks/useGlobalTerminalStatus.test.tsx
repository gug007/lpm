// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StatusEntry } from "../types";

const mocks = vi.hoisted(() => ({
  entries: [] as unknown[],
  getProject: vi.fn(),
  listeners: new Map<string, (...data: unknown[]) => void>(),
}));

vi.mock("../../bridge/commands", () => ({
  GetProject: (name: string) => mocks.getProject(name),
}));
vi.mock("../../bridge/runtime", () => ({
  EventsOn: (name: string, cb: (...data: unknown[]) => void) => {
    mocks.listeners.set(name, cb);
    return () => mocks.listeners.delete(name);
  },
}));

import { useGlobalAgentStatus } from "../store/globalAgentStatus";
import { useGlobalAgentStatusSync, useGlobalTerminalStatus } from "./useGlobalTerminalStatus";

function entry(paneID: string, value: string): StatusEntry {
  return { key: `claude_code_${paneID}`, value, priority: 0, timestamp: Date.now(), paneID } as StatusEntry;
}

// The sync runs once for the window; a reader anywhere in it sees the rows.
function Sync() {
  useGlobalAgentStatusSync();
  return null;
}

function Probe() {
  const status = useGlobalTerminalStatus();
  return (
    <div id="out">
      {[...status.running].join(",")}|{[...status.done].join(",")}
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;

async function render(withSync: boolean) {
  await act(async () => {
    root.render(
      <>
        {withSync && <Sync />}
        <Probe />
      </>,
    );
  });
}

const out = () => container.querySelector("#out")?.textContent;

async function fire(project: string) {
  await act(async () => {
    mocks.listeners.get("status-changed")?.(project);
    await vi.advanceTimersByTimeAsync(300);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.entries = [];
  mocks.listeners.clear();
  mocks.getProject.mockReset();
  mocks.getProject.mockImplementation(() =>
    Promise.resolve({ name: "__global__", statusEntries: mocks.entries }),
  );
  useGlobalAgentStatus.setState({ entries: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("useGlobalAgentStatusSync", () => {
  it("fetches the reserved project's rows up front and refetches on its status events", async () => {
    await render(true);
    expect(mocks.getProject).toHaveBeenCalledWith("__global__");
    expect(out()).toBe("|");

    mocks.entries = [entry("t1", "Running"), entry("t2", "Done")];
    await fire("__global__");
    expect(out()).toBe("t1|t2");
  });

  it("ignores other projects' status events and debounces bursts", async () => {
    await render(true);
    const calls = mocks.getProject.mock.calls.length;
    await fire("myapp");
    expect(mocks.getProject.mock.calls.length).toBe(calls);

    mocks.entries = [entry("t1", "Running")];
    await act(async () => {
      const cb = mocks.listeners.get("status-changed")!;
      cb("__global__");
      cb("__global__");
      cb("__global__");
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(mocks.getProject.mock.calls.length).toBe(calls + 1);
    expect(out()).toBe("t1|");
  });

  it("serves a reader that never mounted the sync from the shared store", async () => {
    await render(false);
    expect(mocks.getProject).not.toHaveBeenCalled();
    expect(mocks.listeners.has("status-changed")).toBe(false);

    await act(async () => {
      useGlobalAgentStatus.setState({ entries: [entry("t1", "Done")] });
    });
    expect(out()).toBe("|t1");
  });

  it("stops listening once unmounted", async () => {
    await render(true);
    expect(mocks.listeners.has("status-changed")).toBe(true);

    await render(false);
    expect(mocks.listeners.has("status-changed")).toBe(false);
  });
});
