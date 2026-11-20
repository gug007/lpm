import { describe, expect, it } from "vitest";
import {
  COMPOSER_TOOL_IDS,
  DEFAULT_COMPOSER_TOOLBAR,
  composerMenuTools,
  isComposerToolId,
  isDefaultComposerToolbar,
  normalizeComposerToolbar,
  withComposerToolbar,
  withNewComposerTools,
  isNewComposerTool,
  normalizeComposerToolTimes,
  NEW_COMPOSER_TOOL_MS,
} from "./composerTools";

describe("normalizeComposerToolbar", () => {
  it("returns undefined for anything that is not a list", () => {
    expect(normalizeComposerToolbar(undefined)).toBeUndefined();
    expect(normalizeComposerToolbar(null)).toBeUndefined();
    expect(normalizeComposerToolbar("mic")).toBeUndefined();
    expect(normalizeComposerToolbar({ 0: "mic" })).toBeUndefined();
  });

  it("keeps an empty list, so an emptied row is not read as untouched", () => {
    expect(normalizeComposerToolbar([])).toEqual([]);
  });

  it("drops unknown ids, dedupes, and sorts into canonical order", () => {
    expect(normalizeComposerToolbar(["model", "nope", "mic", "model", 7])).toEqual([
      "mic",
      "model",
    ]);
  });
});

describe("withComposerToolbar", () => {
  it("moves a tool into the row at its canonical position", () => {
    expect(withComposerToolbar(["mic", "model"], "forkCopy", true)).toEqual(["mic", "forkCopy", "model"]);
  });

  it("moves a tool back into the menu", () => {
    expect(withComposerToolbar(["mic", "history"], "mic", false)).toEqual(["history"]);
  });

  it("is a no-op when the tool is already where it is being moved", () => {
    expect(withComposerToolbar(["mic"], "mic", true)).toEqual(["mic"]);
    expect(withComposerToolbar(["mic"], "fork", false)).toEqual(["mic"]);
  });

  it("round-trips back to the same order", () => {
    const start = [...DEFAULT_COMPOSER_TOOLBAR];
    const out = withComposerToolbar(withComposerToolbar(start, "forkCopy", true), "forkCopy", false);
    expect(out).toEqual(start);
  });
});

describe("composerMenuTools", () => {
  it("is everything the row does not hold", () => {
    expect(composerMenuTools(DEFAULT_COMPOSER_TOOLBAR)).toEqual(["image", "forkCopy", "saveCommand"]);
    expect(composerMenuTools(COMPOSER_TOOL_IDS)).toEqual([]);
  });
});

describe("isDefaultComposerToolbar", () => {
  it("recognizes the default and rejects any change to it", () => {
    expect(isDefaultComposerToolbar([...DEFAULT_COMPOSER_TOOLBAR])).toBe(true);
    expect(isDefaultComposerToolbar([])).toBe(false);
    expect(isDefaultComposerToolbar([...DEFAULT_COMPOSER_TOOLBAR, "forkCopy"])).toBe(false);
    expect(isDefaultComposerToolbar(DEFAULT_COMPOSER_TOOLBAR.slice(1))).toBe(false);
  });
});

describe("isComposerToolId", () => {
  it("accepts every canonical id and nothing else", () => {
    for (const id of COMPOSER_TOOL_IDS) expect(isComposerToolId(id)).toBe(true);
    expect(isComposerToolId("send")).toBe(false);
    expect(isComposerToolId(3)).toBe(false);
  });
});

describe("withNewComposerTools", () => {
  it("seats a tool added after an old layout was saved", () => {
    expect(withNewComposerTools(["mic", "history", "model"], undefined)).toEqual(["mic", "history", "video", "model"]);
  });

  it("leaves a tool where the user put it once the layout has seen it", () => {
    expect(withNewComposerTools(["mic", "model"], COMPOSER_TOOL_IDS)).toEqual(["mic", "model"]);
  });

  it("leaves a new tool that starts in the menu in the menu", () => {
    const seenAllButCopy = COMPOSER_TOOL_IDS.filter((id) => id !== "forkCopy");
    expect(withNewComposerTools(["mic"], seenAllButCopy)).toEqual(["mic"]);
  });

  it("puts image in the menu of a layout saved before it", () => {
    const seenBefore = COMPOSER_TOOL_IDS.filter((id) => id !== "image");
    const row = withNewComposerTools(["mic", "video", "model"], seenBefore);
    expect(row).toEqual(["mic", "video", "model"]);
    expect(composerMenuTools(row)).toContain("image");
  });
});

describe("isNewComposerTool", () => {
  const now = 1_000_000_000_000;

  it("marks an announced tool new until it's seen", () => {
    expect(isNewComposerTool("video", undefined, now)).toBe(true);
    expect(isNewComposerTool("video", 0, now)).toBe(false);
  });

  it("drops the mark a week after it was first on screen", () => {
    const firstShown = now - NEW_COMPOSER_TOOL_MS + 1;
    expect(isNewComposerTool("video", firstShown + NEW_COMPOSER_TOOL_MS, now)).toBe(true);
    expect(isNewComposerTool("video", now, now)).toBe(false);
  });

  it("never marks a tool that isn't announced", () => {
    expect(isNewComposerTool("memory", undefined, now)).toBe(false);
  });
});

describe("normalizeComposerToolTimes", () => {
  it("keeps known tools with a real time", () => {
    expect(normalizeComposerToolTimes({ video: 5, nope: 6, memory: "x", fork: Infinity })).toEqual({ video: 5 });
    expect(normalizeComposerToolTimes([1])).toBeUndefined();
    expect(normalizeComposerToolTimes(null)).toBeUndefined();
  });
});
