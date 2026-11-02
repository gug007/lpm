import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const events = vi.hoisted(() => new Map<string, (payload: unknown) => void>());
vi.mock("../../../bridge/runtime", () => ({
  EventsOn: (name: string, fn: (payload: unknown) => void) => {
    events.set(name, fn);
    return () => events.delete(name);
  },
}));
const pane = vi.hoisted(() => ({ outputAt: 0 }));
vi.mock("../../components/InteractivePane", () => ({ interactivePaneOutputAt: () => pane.outputAt }));
const app = vi.hoisted(() => ({ projects: [] as { name: string; statusEntries: { paneID: string; value: string }[] }[] }));
vi.mock("../../store/app", () => ({ useAppStore: { getState: () => app } }));

import { whenClaudeBack } from "./claudeBack";

let resolved: boolean;
const track = (p: Promise<void>) => {
  resolved = false;
  p.then(() => (resolved = true));
};

beforeEach(() => {
  vi.useFakeTimers();
  events.clear();
  pane.outputAt = 0;
  app.projects = [{ name: "web", statusEntries: [] }];
});

afterEach(() => vi.useRealTimers());

describe("whenClaudeBack", () => {
  it("waits for Claude to start and then draw its screen", async () => {
    track(whenClaudeBack("web", "pty-2", "settled"));
    pane.outputAt = performance.now();
    await vi.advanceTimersByTimeAsync(400);
    expect(resolved).toBe(false);

    events.get("agent-session")!({ paneId: "pty-2" });
    await vi.advanceTimersByTimeAsync(100);
    pane.outputAt = performance.now();
    await vi.advanceTimersByTimeAsync(150);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(200);
    expect(resolved).toBe(true);
    expect(events.has("agent-session")).toBe(false);
  });

  it("waits for a carried-on turn to report working", async () => {
    track(whenClaudeBack("web", "pty-2", "working"));
    events.get("agent-session")!({ paneId: "pty-2" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(resolved).toBe(false);

    app.projects[0].statusEntries = [{ paneID: "pty-2", value: "Running" }];
    await vi.advanceTimersByTimeAsync(60);
    expect(resolved).toBe(true);
  });

  it("takes either sign for a move another machine ran", async () => {
    track(whenClaudeBack("web", "pty-2", "either"));
    events.get("agent-session")!({ paneId: "pty-2" });
    app.projects[0].statusEntries = [{ paneID: "pty-2", value: "Running" }];
    await vi.advanceTimersByTimeAsync(60);
    expect(resolved).toBe(true);
  });

  it("ignores other terminals and gives up when nothing reports", async () => {
    track(whenClaudeBack("web", "pty-2", "settled"));
    events.get("agent-session")!({ paneId: "pty-9" });
    await vi.advanceTimersByTimeAsync(5900);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(resolved).toBe(true);
    expect(events.has("agent-session")).toBe(false);
  });
});
