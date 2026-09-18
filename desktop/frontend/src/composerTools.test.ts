import { describe, expect, it } from "vitest";
import {
  COMPOSER_TOOL_IDS,
  DEFAULT_COMPOSER_TOOLBAR,
  composerMenuTools,
  isComposerToolId,
  isDefaultComposerToolbar,
  normalizeComposerToolbar,
  withComposerToolbar,
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
    expect(composerMenuTools(DEFAULT_COMPOSER_TOOLBAR)).toEqual(["forkCopy"]);
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
