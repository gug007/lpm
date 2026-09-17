import { describe, expect, it } from "vitest";
import {
  DEFAULT_PANE_TOOLBAR,
  isDefaultPaneToolbar,
  normalizePaneToolbar,
  paneMenuActions,
  withPaneToolbar,
} from "./paneActions";

describe("pane toolbar layout", () => {
  it("ships with Files on the toolbar and the rest in the menu", () => {
    expect(DEFAULT_PANE_TOOLBAR).toEqual(["files"]);
    expect(paneMenuActions(DEFAULT_PANE_TOOLBAR)).toEqual(["review", "toolkit", "browser", "resume"]);
    expect(isDefaultPaneToolbar(DEFAULT_PANE_TOOLBAR)).toBe(true);
  });

  it("moves an item out and back without disturbing the order", () => {
    const withReview = withPaneToolbar(DEFAULT_PANE_TOOLBAR, "review", true);
    expect(withReview).toEqual(["review", "files"]);
    expect(paneMenuActions(withReview)).toEqual(["toolkit", "browser", "resume"]);
    expect(withPaneToolbar(withReview, "review", false)).toEqual(["files"]);
    expect(withPaneToolbar(withReview, "files", false)).toEqual(["review"]);
    expect(isDefaultPaneToolbar(withReview)).toBe(false);
  });

  it("sanitizes stored lists and keeps an emptied toolbar distinct from an untouched one", () => {
    expect(normalizePaneToolbar(["browser", "bogus", "files", "files"])).toEqual(["files", "browser"]);
    expect(normalizePaneToolbar([])).toEqual([]);
    expect(normalizePaneToolbar("files")).toBeUndefined();
    expect(normalizePaneToolbar(undefined)).toBeUndefined();
  });
});
