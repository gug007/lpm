import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

let store: MemoryStorage;

// Drafts and the inbound-prompt subscriptions live in module scope, so each test
// gets a fresh copy of the module.
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

describe("deliverPromptDraft", () => {
  it("hands the prompt to a mounted composer instead of parking it", async () => {
    const m = await import("./composerDrafts");
    const seen: Array<[string, Record<string, string>]> = [];
    m.subscribeInboundPrompt("term-1", (text, images) => seen.push([text, images]));

    m.deliverPromptDraft("term-1", "hk-1", "ship it", { "2": "/tmp/a.png" });

    expect(seen).toEqual([["ship it", { "2": "/tmp/a.png" }]]);
    expect(m.loadComposerDraft("term-1")).toBeUndefined();
  });

  it("parks the prompt as its own input when no composer is mounted", async () => {
    const m = await import("./composerDrafts");
    m.deliverPromptDraft("term-1", "hk-1", "ship it", { "2": "/tmp/a.png" });

    const draft = m.loadComposerDraft("term-1");
    expect(draft?.tabs).toHaveLength(1);
    expect(draft?.tabs[0].text).toBe("ship it");
    expect(draft?.tabs[0].imagePaths).toEqual(new Map([[2, "/tmp/a.png"]]));
    // The next paste there must not hand out a token this prompt already holds.
    expect(draft?.tabs[0].imgCounter).toBe(2);
    expect(draft?.activeTabId).toBe(draft?.tabs[0].id);
  });

  it("keeps a prompt already prepared there and lands beside it", async () => {
    const m = await import("./composerDrafts");
    const mine = m.createInputTab();
    mine.text = "mine";
    m.saveComposerDraft("term-1", { tabs: [mine], activeTabId: mine.id, history: [] }, "hk-1");

    m.deliverPromptDraft("term-1", "hk-1", "yours", {});

    const draft = m.loadComposerDraft("term-1");
    expect(draft?.tabs.map((t) => t.text)).toEqual(["mine", "yours"]);
    expect(draft?.activeTabId).toBe(draft?.tabs[1].id);
  });

  it("takes the place of a lone empty input rather than leaving it behind", async () => {
    const m = await import("./composerDrafts");
    const blank = m.createInputTab();
    m.saveComposerDraft("term-1", { tabs: [blank], activeTabId: blank.id, history: [] }, "hk-1");

    m.deliverPromptDraft("term-1", "hk-1", "yours", {});

    expect(m.loadComposerDraft("term-1")?.tabs.map((t) => t.text)).toEqual(["yours"]);
  });

  it("lands on the draft restored from disk instead of shadowing it", async () => {
    const persist = await import("./composerDraftPersist");
    const m = await import("./composerDrafts");
    const saved = m.createInputTab();
    saved.text = "typed before the restart";
    persist.schedulePersistDraft("hk-1", { tabs: [saved], activeTabId: saved.id, history: [] });
    vi.advanceTimersByTime(500);

    m.deliverPromptDraft("term-1", "hk-1", "moved in", {});

    expect(m.loadComposerDraft("term-1", "hk-1")?.tabs.map((t) => t.text)).toEqual([
      "typed before the restart",
      "moved in",
    ]);
  });

  it("persists the move so it survives a quit before that composer is opened", async () => {
    const persist = await import("./composerDraftPersist");
    const m = await import("./composerDrafts");
    m.deliverPromptDraft("term-1", "hk-1", "moved in", {});
    vi.advanceTimersByTime(500);

    expect(persist.loadPersistedDraft("hk-1")?.tabs.map((t) => t.text)).toEqual(["moved in"]);
  });

  it("stops delivering once the composer unsubscribes", async () => {
    const m = await import("./composerDrafts");
    const seen: string[] = [];
    const off = m.subscribeInboundPrompt("term-1", (text) => seen.push(text));
    off();

    m.deliverPromptDraft("term-1", "hk-1", "ship it", {});

    expect(seen).toEqual([]);
    expect(m.loadComposerDraft("term-1")?.tabs[0].text).toBe("ship it");
  });
});

describe("deliverPromptDraft with a legacy tab", () => {
  it("keeps the move out of durable storage when the key is a volatile pty id", async () => {
    const persist = await import("./composerDraftPersist");
    const m = await import("./composerDrafts");
    // Tabs written before history keys existed fall back to the pty id, which
    // Rust re-mints every launch.
    m.deliverPromptDraft("web-1", "web-1", "moved in", {});
    vi.advanceTimersByTime(500);

    expect(m.loadComposerDraft("web-1")?.tabs[0].text).toBe("moved in");
    expect(persist.loadPersistedDraft("web-1")).toBeUndefined();
  });
});

describe("insertComposerText", () => {
  it("hands the text to a mounted composer", async () => {
    const m = await import("./composerDrafts");
    const seen: string[] = [];
    m.subscribeComposerInsert("term-1", (text) => seen.push(text));

    expect(m.insertComposerText("term-1", "hk-1", "@src/a.ts ")).toBe(true);
    expect(seen).toEqual(["@src/a.ts "]);
    expect(m.loadComposerDraft("term-1")).toBeUndefined();
  });

  it("joins the parked prompt that is on screen, spaced off its last word", async () => {
    const m = await import("./composerDrafts");
    const other = m.createInputTab();
    other.text = "other";
    const mine = m.createInputTab();
    mine.text = "look at";
    m.saveComposerDraft("term-1", { tabs: [other, mine], activeTabId: mine.id, history: [] }, "hk-1");

    expect(m.insertComposerText("term-1", "hk-1", "@src/a.ts ")).toBe(false);

    const draft = m.loadComposerDraft("term-1", "hk-1");
    expect(draft?.tabs.map((t) => t.text)).toEqual(["other", "look at @src/a.ts "]);
  });

  it("tells a mounted composer when the text is a block", async () => {
    const m = await import("./composerDrafts");
    const seen: [string, boolean][] = [];
    m.subscribeComposerInsert("term-1", (text, block) => seen.push([text, block]));

    m.insertComposerText("term-1", "hk-1", "> hi\n\n", true);
    m.insertComposerText("term-1", "hk-1", "@a.ts ");
    expect(seen).toEqual([
      ["> hi\n\n", true],
      ["@a.ts ", false],
    ]);
  });

  it("puts a block after the parked prompt's text, a blank line apart", async () => {
    const m = await import("./composerDrafts");
    const mine = m.createInputTab();
    mine.text = "keep it in memory  ";
    m.saveComposerDraft("term-1", { tabs: [mine], activeTabId: mine.id, history: [] }, "hk-1");

    expect(m.insertComposerText("term-1", "hk-1", "> use Redis\n\n", true)).toBe(false);

    const draft = m.loadComposerDraft("term-1", "hk-1");
    expect(draft?.tabs.map((t) => t.text)).toEqual(["keep it in memory\n\n> use Redis\n\n"]);
  });

  it("starts a prompt where there is none", async () => {
    const m = await import("./composerDrafts");
    m.insertComposerText("term-1", "hk-1", "@README.md ");
    const draft = m.loadComposerDraft("term-1", "hk-1");
    expect(draft?.tabs.map((t) => t.text)).toEqual(["@README.md "]);
    expect(draft?.activeTabId).toBe(draft?.tabs[0].id);
  });
});
