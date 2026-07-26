import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComposerDraft, ComposerInputTab } from "./composerDrafts";

class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

const KEY = "lpm:composer-draft:v1:hk";
const DAY_MS = 24 * 60 * 60 * 1000;

let store: MemoryStorage;

// The module keeps pending writes and a once-per-run prune flag in module scope,
// so each test gets a fresh copy.
beforeEach(() => {
  vi.useFakeTimers();
  store = new MemoryStorage();
  vi.stubGlobal("localStorage", store);
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function tab(over: Partial<ComposerInputTab> = {}): ComposerInputTab {
  return { id: "t1", text: "", imagePaths: new Map(), imgCounter: 0, histIdx: -1, stash: null, ...over };
}

function draft(tabs: ComposerInputTab[], activeTabId = tabs[0].id): ComposerDraft {
  return { tabs, activeTabId, history: [] };
}

describe("composerDraftPersist", () => {
  it("round-trips tabs, active tab, images and counter after the debounce fires", async () => {
    const { schedulePersistDraft, loadPersistedDraft } = await import("./composerDraftPersist");
    const a = tab({ id: "a", text: "first" });
    const b = tab({
      id: "b",
      text: "look [Image #2]",
      imagePaths: new Map([[2, "/tmp/shot.png"]]),
      imgCounter: 2,
    });
    schedulePersistDraft("hk", draft([a, b], "b"));

    expect(store.getItem(KEY)).toBeNull();
    vi.advanceTimersByTime(500);

    const restored = loadPersistedDraft("hk");
    expect(restored?.activeTabId).toBe("b");
    expect(restored?.history).toEqual([]);
    expect(restored?.tabs.map((t) => t.text)).toEqual(["first", "look [Image #2]"]);
    expect(restored?.tabs[1].imagePaths).toEqual(new Map([[2, "/tmp/shot.png"]]));
    expect(restored?.tabs[1].imgCounter).toBe(2);
  });

  it("serializes the draft as it stands when the timer fires, not when it was scheduled", async () => {
    const { schedulePersistDraft, loadPersistedDraft } = await import("./composerDraftPersist");
    const live = tab({ text: "he" });
    schedulePersistDraft("hk", draft([live]));
    live.text = "hello";
    vi.advanceTimersByTime(500);

    expect(loadPersistedDraft("hk")?.tabs[0].text).toBe("hello");
  });

  it("persists the parked draft of a tab sitting on a recalled message", async () => {
    const { schedulePersistDraft, loadPersistedDraft } = await import("./composerDraftPersist");
    const recalling = tab({
      text: "an already sent message",
      imagePaths: new Map([[1, "/tmp/sent.png"]]),
      imgCounter: 3,
      histIdx: 0,
      stash: { text: "what I was typing [Image #3]", images: { 3: "/tmp/draft.png" } },
    });
    schedulePersistDraft("hk", draft([recalling]));
    vi.advanceTimersByTime(500);

    const restored = loadPersistedDraft("hk");
    expect(restored?.tabs[0]).toEqual({
      id: "t1",
      text: "what I was typing [Image #3]",
      imagePaths: new Map([[3, "/tmp/draft.png"]]),
      imgCounter: 3,
      histIdx: -1,
      stash: null,
    });
  });

  it("restores an empty tab for a recalled message with nothing parked", async () => {
    const { schedulePersistDraft, loadPersistedDraft } = await import("./composerDraftPersist");
    schedulePersistDraft("hk", draft([tab({ text: "sent", histIdx: 1, stash: null })]));
    vi.advanceTimersByTime(500);

    expect(loadPersistedDraft("hk")).toBeUndefined();
    expect(store.getItem(KEY)).toBeNull();
  });

  it("removes the stored entry once every tab is empty", async () => {
    const { schedulePersistDraft, loadPersistedDraft } = await import("./composerDraftPersist");
    schedulePersistDraft("hk", draft([tab({ text: "typed" })]));
    vi.advanceTimersByTime(500);
    expect(store.getItem(KEY)).not.toBeNull();

    schedulePersistDraft("hk", draft([tab({ text: "   " }), tab({ id: "t2" })]));
    vi.advanceTimersByTime(500);

    expect(store.getItem(KEY)).toBeNull();
    expect(loadPersistedDraft("hk")).toBeUndefined();
  });

  it("deletePersistedDraft cancels a pending write and drops the entry", async () => {
    const { schedulePersistDraft, deletePersistedDraft, loadPersistedDraft } = await import(
      "./composerDraftPersist"
    );
    schedulePersistDraft("hk", draft([tab({ text: "typed" })]));
    vi.advanceTimersByTime(500);
    schedulePersistDraft("hk", draft([tab({ text: "typed more" })]));
    deletePersistedDraft("hk");
    vi.advanceTimersByTime(500);

    expect(store.getItem(KEY)).toBeNull();
    expect(loadPersistedDraft("hk")).toBeUndefined();
  });

  it("drops a corrupt entry and reports no draft", async () => {
    const { loadPersistedDraft } = await import("./composerDraftPersist");
    loadPersistedDraft("warm"); // let the one-time prune run against an empty store
    store.setItem(KEY, "{not json");

    expect(loadPersistedDraft("hk")).toBeUndefined();
    expect(store.getItem(KEY)).toBeNull();
  });

  it("prunes entries older than 30 days and keeps recent ones", async () => {
    const { loadPersistedDraft } = await import("./composerDraftPersist");
    const stale = "lpm:composer-draft:v1:old";
    const entry = (at: number) =>
      JSON.stringify({ at, activeTabId: "t1", tabs: [{ id: "t1", text: "hi", images: {}, imgCounter: 0 }] });
    store.setItem(stale, entry(Date.now() - 31 * DAY_MS));
    store.setItem(KEY, entry(Date.now() - DAY_MS));

    expect(loadPersistedDraft("hk")?.tabs[0].text).toBe("hi");
    expect(store.getItem(stale)).toBeNull();
    expect(store.getItem(KEY)).not.toBeNull();
  });
});

describe("composerDrafts persistence handoff", () => {
  it("loads a persisted draft when memory has none, and forgets both on close", async () => {
    const { saveComposerDraft, loadComposerDraft, forgetComposerDraft } = await import(
      "./composerDrafts"
    );
    saveComposerDraft("pty-1", draft([tab({ text: "typed" })]), "hk");
    vi.advanceTimersByTime(500);

    // A restart re-mints the PTY id; the stable historyKey is what finds the draft.
    expect(loadComposerDraft("pty-2", "hk")?.tabs[0].text).toBe("typed");
    expect(loadComposerDraft("pty-2")).toBeUndefined();

    forgetComposerDraft("pty-1", "hk");
    expect(store.getItem(KEY)).toBeNull();
    expect(loadComposerDraft("pty-2", "hk")).toBeUndefined();
  });

  it("keeps the persisted draft when a session is disposed without a historyKey", async () => {
    const { saveComposerDraft, loadComposerDraft, forgetComposerDraft } = await import(
      "./composerDrafts"
    );
    saveComposerDraft("pty-1", draft([tab({ text: "typed" })]), "hk");
    vi.advanceTimersByTime(500);

    forgetComposerDraft("pty-1");

    expect(loadComposerDraft("pty-2", "hk")?.tabs[0].text).toBe("typed");
  });
});
