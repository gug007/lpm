// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pullDeck: vi.fn() }));
vi.mock("../originActions", () => ({ pullDeck: mocks.pullDeck }));

import { SidebarDeckPullRow, type DeckPullTarget } from "./SidebarDeckPullRow";
import { useDeckPull, type DeckPull } from "../store/deckPull";
import { useOriginStatus } from "../store/originStatus";
import type { OriginStatus } from "../originStatus";

let container: HTMLDivElement;
let root: Root;

const status = (over: Partial<OriginStatus> = {}): OriginStatus => ({
  branch: "main",
  hasUpstream: true,
  ahead: 0,
  behind: 0,
  base: "",
  baseBehind: 0,
  conflicted: false,
  fetched: true,
  ...over,
});

const target = (name: string, over: Partial<DeckPullTarget> = {}): DeckPullTarget => ({
  root: `/Users/me/Projects/${name}`,
  name,
  isParent: false,
  ...over,
});

const LPM = target("lpm", { isParent: true });
const COPIES = ["lpm-duplicate", "lpm-demo", "lpm-ads", "lpm-sidebar"].map((name) => target(name));
const DECK = [LPM, ...COPIES];

function behind(...targets: DeckPullTarget[]) {
  act(() => {
    for (const t of targets) useOriginStatus.getState().setStatus(t.root, status({ behind: 1 }));
  });
}

function setDeck(pull: DeckPull) {
  act(() => useDeckPull.getState().setDeck("lpm", pull));
}

function show(targets: DeckPullTarget[] = DECK) {
  act(() => {
    root.render(<SidebarDeckPullRow deck="lpm" parentLabel="lpm" targets={targets} indented={false} />);
  });
  return container.firstElementChild as HTMLElement | null;
}

beforeEach(() => {
  useOriginStatus.getState().reset();
  useDeckPull.getState().reset();
  for (const t of DECK) useOriginStatus.getState().setStatus(t.root, status());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("SidebarDeckPullRow", () => {
  it("stays away until two rows of the deck only need a pull", () => {
    expect(show()).toBeNull();
    behind(COPIES[0]);
    expect(show()).toBeNull();
    act(() => useOriginStatus.getState().setStatus(COPIES[1].root, status({ ahead: 1, behind: 1 })));
    expect(show()).toBeNull();
  });

  it("offers the copies, and pulls the whole deck on a press", () => {
    behind(...COPIES);
    const row = show()!;
    expect(row.textContent).toBe("↓ Pull 4 duplicates");
    expect(row.title).toBe("Pull lpm-duplicate, lpm-demo, lpm-ads, lpm-sidebar");
    act(() => row.click());
    expect(mocks.pullDeck).toHaveBeenCalledWith("lpm", DECK);
  });

  it("names the parent when it is behind too, and worktrees as worktrees", () => {
    behind(LPM, COPIES[0]);
    expect(show()!.textContent).toBe("↓ Pull lpm and 1 duplicate");
    const trees = COPIES.map((c) => ({ ...c, worktree: true }));
    behind(...trees);
    expect(show([LPM, ...trees])!.textContent).toBe("↓ Pull lpm and 4 worktrees");
  });

  it("leaves out a row whose own pull is already running", () => {
    behind(COPIES[0], COPIES[1]);
    act(() => useOriginStatus.getState().setRunning(COPIES[1].root, true));
    expect(show()).toBeNull();
  });

  it("shows progress, then the result", () => {
    behind(...COPIES);
    setDeck({ total: 4, done: 1, running: true, failed: [] });
    expect(show()!.textContent).toBe("Pulling 2 of 4");
    setDeck({ total: 4, done: 4, running: false, failed: [] });
    expect(show()!.textContent).toBe("✓ 4 pulled");
  });

  it("names a row that didn't pull and retries the deck", () => {
    behind(COPIES[2]);
    setDeck({ total: 4, done: 4, running: false, failed: [COPIES[2].root] });
    const row = show()!;
    expect(row.textContent).toBe("lpm-ads didn’t pullRetry");
    act(() => row.querySelector("button")!.click());
    expect(mocks.pullDeck).toHaveBeenCalledWith("lpm", DECK);
  });

  it("drops a failure once that row has caught up some other way", () => {
    setDeck({ total: 4, done: 4, running: false, failed: [COPIES[2].root] });
    expect(show()).toBeNull();
  });
});
