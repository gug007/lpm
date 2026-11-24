import { describe, expect, it } from "vitest";
import { decideClose, matchingTabs, type ClosableTab } from "./decide";
import type { CloseTabRequest } from "./request";

const tab = (over: Partial<ClosableTab> = {}): ClosableTab => ({
  id: "api-1",
  names: ["Docs", "Docs"],
  pinned: false,
  facts: { busy: false },
  command: null,
  ranCommand: false,
  holds: null,
  ...over,
});

const ask = (over: Partial<CloseTabRequest> = {}): CloseTabRequest => ({
  project: "api",
  tab: "Docs",
  own: "",
  force: false,
  whenDone: false,
  facts: {},
  ...over,
});

describe("matchingTabs", () => {
  const tabs = [
    tab({ id: "api-1", names: ["Docs", "Docs"] }),
    tab({ id: "api-2", names: ["docs", "docs"] }),
    tab({ id: "api-3", names: ["go run", "Terminal 1"] }),
    tab({ id: "api-4", names: ["api-1", "api-1"] }),
  ];
  const ids = (wanted: string) => matchingTabs(tabs, wanted).map((t) => t.id);

  it("takes an id before a tab named like one", () => {
    expect(ids("api-1")).toEqual(["api-1"]);
  });

  it("takes an exact name before one that differs in case", () => {
    expect(ids("Docs")).toEqual(["api-1"]);
    expect(ids("docs")).toEqual(["api-2"]);
  });

  it("falls back to ignoring case, and says when that fits several", () => {
    expect(ids("DOCS")).toEqual(["api-1", "api-2"]);
    expect(ids("nothing")).toEqual([]);
  });

  it("knows a shell by the command naming it and by its own name", () => {
    expect(ids("go run")).toEqual(["api-3"]);
    expect(ids("terminal 1")).toEqual(["api-3"]);
  });
});

describe("decideClose", () => {
  it("closes an idle tab", () => {
    expect(decideClose(tab(), ask())).toEqual({ do: "close" });
  });

  it.each([
    ["working", { facts: { agent: "working" } }],
    ["waiting", { facts: { agent: "waiting" } }],
    ["starting", { facts: { starting: true } }],
    ["unsent", { holds: "unsent" }],
    ["scheduled", { holds: "scheduled" }],
  ] as [string, Partial<ClosableTab>][])("won't close one that would lose something: %s", (reason, over) => {
    expect(decideClose(tab(over), ask())).toEqual({ refuse: reason });
    expect(decideClose(tab(over), ask({ force: true }))).toEqual({ do: "close" });
  });

  it("names the command a tab still runs", () => {
    const busy = tab({ facts: { busy: true }, command: "go run ./cmd/api" });
    expect(decideClose(busy, ask())).toEqual({ refuse: "command", detail: "go run ./cmd/api" });
    expect(decideClose(tab({ facts: { busy: true } }), ask())).toEqual({ refuse: "command", detail: "" });
  });

  it("goes by the shell where the backend can't tell, and not otherwise", () => {
    expect(decideClose(tab({ facts: {}, command: "npm test" }), ask())).toEqual({ refuse: "command", detail: "npm test" });
    expect(decideClose(tab({ facts: { busy: false }, command: "cc" }), ask())).toEqual({ do: "close" });
    expect(decideClose(tab({ facts: {}, command: "claude --resume a" }), ask())).toEqual({ do: "close" });
  });

  it("leaves a tab whose command is about to be typed, until its shell says it ran", () => {
    const fresh = { facts: { busy: false, launching: true } };
    expect(decideClose(tab(fresh), ask())).toEqual({ refuse: "command", detail: "" });
    expect(decideClose(tab(fresh), ask({ whenDone: true }))).toEqual({ refuse: "command", detail: "" });
    expect(decideClose(tab({ ...fresh, ranCommand: true }), ask())).toEqual({ do: "close" });
  });

  it("tells an agent that reports from a command run in its tab since", () => {
    const idle = { facts: { busy: true, reported: true } };
    expect(decideClose(tab({ ...idle, command: "gemini" }), ask())).toEqual({ do: "close" });
    expect(decideClose(tab(idle), ask())).toEqual({ do: "close" });
    expect(decideClose(tab({ ...idle, command: "npm run dev" }), ask())).toEqual({ refuse: "command", detail: "npm run dev" });
  });

  it("names an agent lpm hears nothing from, and leaves its flags out", () => {
    const quiet = tab({ facts: { busy: true }, command: "opencode --token s3cret" });
    expect(decideClose(quiet, ask())).toEqual({ refuse: "command", detail: "opencode" });
  });

  it("never closes a pinned tab, nor the one the command runs in", () => {
    expect(decideClose(tab({ pinned: true }), ask({ force: true }))).toEqual({ refuse: "pinned" });
    expect(decideClose(tab({ pinned: true }), ask({ whenDone: true }))).toEqual({ refuse: "pinned" });
    expect(decideClose(tab(), ask({ own: "api-1", force: true }))).toEqual({ refuse: "own" });
  });

  describe("when done", () => {
    const later = (over: Partial<ClosableTab>, own = "") => decideClose(tab(over), ask({ whenDone: true, own }));

    it("waits for an agent at work or asking, its own included", () => {
      expect(later({ facts: { agent: "working" } })).toEqual({ do: "wait" });
      expect(later({ facts: { agent: "waiting" } })).toEqual({ do: "wait" });
      expect(later({ facts: { agent: "working" } }, "api-1")).toEqual({ do: "wait" });
    });

    it("waits for the first turn of an agent just launched", () => {
      expect(later({ facts: { starting: true, busy: true }, command: null })).toEqual({ do: "waitForFirstTurn" });
    });

    it("closes a tab whose agent is already done", () => {
      expect(later({})).toEqual({ do: "close" });
    });

    it("won't guess: no agent to wait for, or a message it would lose", () => {
      expect(later({}, "api-1")).toEqual({ refuse: "ownIdle" });
      expect(later({ facts: { busy: true }, command: "npm test" })).toEqual({ refuse: "command", detail: "npm test" });
      expect(later({ facts: { agent: "working" }, holds: "unsent" })).toEqual({ refuse: "unsent" });
    });
  });
});
