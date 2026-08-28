import { describe, expect, it } from "vitest";
import {
  DEAL_DURATION_MS,
  DEAL_STEP_MS,
  dealDurationMs,
  deckKindLabel,
  deckLabel,
  deckRunDomId,
} from "./sidebarDeck";
import type { ProjectInfo } from "../types";

function child(name: string, worktree = false): ProjectInfo {
  return {
    name,
    session: "",
    root: `/tmp/${name}`,
    running: false,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries: [],
    isRemote: false,
    parentName: "glimpse2",
    worktree,
  };
}

describe("deckKindLabel", () => {
  it("names only the kind the parent actually owns", () => {
    expect(deckKindLabel([child("a"), child("b")])).toBe("duplicates");
    expect(deckKindLabel([child("fix-auth", true), child("perf", true)])).toBe("worktrees");
  });

  it("stays singular for one", () => {
    expect(deckKindLabel([child("a")])).toBe("duplicate");
    expect(deckKindLabel([child("fix-auth", true)])).toBe("worktree");
  });

  it("names both when the pile is mixed", () => {
    expect(deckKindLabel([child("a"), child("fix-auth", true)])).toBe("duplicates & worktrees");
  });
});

describe("deckLabel", () => {
  it("says what the control does, to how many, and whose", () => {
    const children = [child("a"), child("b"), child("fix-auth", true)];
    expect(deckLabel(children, "glimpse2", true)).toBe(
      "Show 3 duplicates & worktrees of glimpse2",
    );
    expect(deckLabel(children, "glimpse2", false)).toBe(
      "Hide 3 duplicates & worktrees of glimpse2",
    );
  });
});

describe("deckRunDomId", () => {
  it("tames a name the way a project row's id is tamed", () => {
    expect(deckRunDomId("glimpse2")).toBe("sidebar-deck-glimpse2");
    expect(deckRunDomId("my app/2")).toBe("sidebar-deck-my_app_2");
  });
});

describe("dealDurationMs", () => {
  it("is one card for a single row, and the whole stagger for a run", () => {
    expect(dealDurationMs(1)).toBe(DEAL_DURATION_MS);
    expect(dealDurationMs(6)).toBe(DEAL_DURATION_MS + 5 * DEAL_STEP_MS);
  });

  it("never goes below one card, however empty the deck", () => {
    expect(dealDurationMs(0)).toBe(DEAL_DURATION_MS);
  });
});
