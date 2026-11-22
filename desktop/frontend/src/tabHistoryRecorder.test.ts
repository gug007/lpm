import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tab = (id: string, historyKey: string, label = historyKey) => ({ id, historyKey, label, emoji: "" });

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
}

describe("tab history", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  async function load() {
    const { useTabHistory } = await import("./store/tabHistory");
    const { useTerminalTargets } = await import("./store/terminalTargets");
    const { useTerminalTitles } = await import("./store/terminalTitles");
    const { startTabHistory } = await import("./tabHistoryRecorder");
    return { useTabHistory, useTerminalTargets, useTerminalTitles, startTabHistory };
  }

  it("records each tab as it comes on screen, newest first, and again when it comes back", async () => {
    const { useTabHistory, useTerminalTargets, useTerminalTitles, startTabHistory } = await load();
    const stop = startTabHistory();
    useTerminalTargets.getState().setProjectTargets("bowen", [tab("t1", "a"), tab("t2", "b")]);
    useTerminalTargets.getState().setProjectTargets("api", [tab("t3", "c")]);

    useTerminalTitles.getState().setProjectFocus("bowen", "t1", true);
    useTerminalTitles.getState().setProjectFocus("bowen", "t2", true);
    useTerminalTitles.getState().setProjectFocus("bowen", "t2", false);
    useTerminalTitles.getState().setProjectFocus("api", "t3", true);
    useTerminalTitles.getState().setProjectFocus("api", "t3", false);
    useTerminalTitles.getState().setProjectFocus("bowen", "t2", true);
    stop();

    expect(useTabHistory.getState().visits.map((v) => v.key)).toEqual(["b", "c", "a"]);
  });

  it("a tab in a project that's open off screen isn't counted as visited", async () => {
    const { useTabHistory, useTerminalTargets, useTerminalTitles, startTabHistory } = await load();
    const stop = startTabHistory();
    useTerminalTargets.getState().setProjectTargets("bowen", [tab("t1", "a")]);
    useTerminalTitles.getState().setProjectFocus("bowen", "t1", false);
    stop();
    expect(useTabHistory.getState().visits).toEqual([]);
  });

  it("keeps the history and the tabs' latest names across a restart", async () => {
    let s = await load();
    let stop = s.startTabHistory();
    s.useTerminalTargets.getState().setProjectTargets("bowen", [tab("t1", "a", "Claude Code")]);
    s.useTerminalTitles.getState().setProjectFocus("bowen", "t1", true);
    s.useTerminalTargets.getState().setProjectTargets("bowen", [tab("t1", "a", "Fix login")]);
    stop();

    vi.resetModules();
    s = await load();
    expect(s.useTabHistory.getState().visits).toEqual([{ project: "bowen", key: "a", label: "Fix login" }]);
  });
});
