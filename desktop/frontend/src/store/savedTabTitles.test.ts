import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
}

describe("saved tab names", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps a project's names after it closes and across a restart", async () => {
    let { useTerminalTitles } = await import("./terminalTitles");
    useTerminalTitles.getState().setProjectTitles("peer-abcd1234-server", { t1: "Fix login", t2: "Deploy" });
    useTerminalTitles.getState().clearProject("peer-abcd1234-server");

    vi.resetModules();
    ({ useTerminalTitles } = await import("./terminalTitles"));
    const { useSavedTabTitles } = await import("./savedTabTitles");
    expect(useTerminalTitles.getState().byProject["peer-abcd1234-server"]).toBeUndefined();
    expect(useSavedTabTitles.getState().byProject["peer-abcd1234-server"]).toEqual({ t1: "Fix login", t2: "Deploy" });
  });

  it("an empty list while the tabs come back doesn't wipe the names", async () => {
    const { useTerminalTitles } = await import("./terminalTitles");
    const { useSavedTabTitles } = await import("./savedTabTitles");
    useTerminalTitles.getState().setProjectTitles("bowen", { t1: "Fix login" });
    useTerminalTitles.getState().setProjectTitles("bowen", {});
    expect(useSavedTabTitles.getState().byProject.bowen).toEqual({ t1: "Fix login" });
  });
});
