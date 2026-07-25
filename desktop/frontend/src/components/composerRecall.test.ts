import { describe, expect, it } from "vitest";
import { stepRecall, type RecallCursor } from "./composerRecall";
import type { ComposerHistoryEntry } from "../store/composerDrafts";

const HISTORY: ComposerHistoryEntry[] = [
  { text: "newest", images: {} },
  { text: "middle", images: {} },
  { text: "oldest", images: {} },
];

const field = (text: string): ComposerHistoryEntry => ({ text, images: {} });

const AT_DRAFT: RecallCursor = { index: -1, stash: null };

describe("stepRecall", () => {
  it("does nothing when there is no history", () => {
    expect(stepRecall(AT_DRAFT, 1, [], field("typing"))).toBeNull();
  });

  it("parks the live draft on the way up", () => {
    expect(stepRecall(AT_DRAFT, 1, HISTORY, field("typing"))).toEqual({
      index: 0,
      stash: field("typing"),
      entry: HISTORY[0],
    });
  });

  it("restores the parked draft on the way back down", () => {
    expect(stepRecall({ index: 0, stash: field("typing") }, -1, HISTORY, field("newest"))).toEqual({
      index: -1,
      stash: null,
      entry: field("typing"),
    });
  });

  it("keeps the parked draft across intermediate steps", () => {
    const parked = field("typing");
    let cursor: RecallCursor = AT_DRAFT;
    let live = parked;
    for (let i = 0; i < HISTORY.length; i++) {
      const step = stepRecall(cursor, 1, HISTORY, live)!;
      cursor = { index: step.index, stash: step.stash };
      live = step.entry;
    }
    expect(cursor).toEqual({ index: 2, stash: parked });
    expect(stepRecall(cursor, -1, HISTORY, field("oldest"))).toEqual({
      index: 1,
      stash: parked,
      entry: HISTORY[1],
    });
  });

  it("restores an empty field when nothing was parked", () => {
    expect(stepRecall({ index: 0, stash: null }, -1, HISTORY, field("newest"))).toEqual({
      index: -1,
      stash: null,
      entry: { text: "", images: {} },
    });
  });

  it("carries image tokens through the parked draft", () => {
    const parked: ComposerHistoryEntry = { text: "look [Image #1]", images: { 1: "/tmp/a.png" } };
    const up = stepRecall(AT_DRAFT, 1, HISTORY, parked)!;
    const down = stepRecall({ index: up.index, stash: up.stash }, -1, HISTORY, field("newest"))!;
    expect(down.entry).toEqual(parked);
  });

  it("stops at the oldest message", () => {
    expect(stepRecall({ index: 2, stash: field("typing") }, 1, HISTORY, field("oldest"))).toBeNull();
  });

  it("stops at the live draft", () => {
    expect(stepRecall(AT_DRAFT, -1, HISTORY, field("typing"))).toBeNull();
  });
});
