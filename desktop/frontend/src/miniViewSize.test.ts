// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { MINI_VIEW_DEFAULT_SIZE, miniViewRows, rememberMiniViewSize, rememberedMiniViewSize } from "./miniViewSize";
import { useMiniViews } from "./store/miniViews";

afterEach(() => {
  localStorage.clear();
  useMiniViews.setState({ views: [] });
});

describe("mini view size", () => {
  it("fills the first size's screen with six lines, as before resizing existed", () => {
    expect(miniViewRows(MINI_VIEW_DEFAULT_SIZE.height)).toBe(6);
    expect(miniViewRows(560)).toBe(37);
  });

  it("starts from the first size until one is dragged to, and ignores a bad one", () => {
    expect(rememberedMiniViewSize()).toEqual(MINI_VIEW_DEFAULT_SIZE);
    rememberMiniViewSize({ width: 480, height: 200 });
    expect(rememberedMiniViewSize()).toEqual({ width: 480, height: 200 });
    localStorage.setItem("lpm-mini-view-size", '{"width":10,"height":"tall"}');
    expect(rememberedMiniViewSize()).toEqual(MINI_VIEW_DEFAULT_SIZE);
  });

  it("gives a newly kept view the size last dragged to, and resizes one view alone", () => {
    const { toggle, resize } = useMiniViews.getState();
    toggle({ termId: "a", project: "p", label: "A" });
    rememberMiniViewSize({ width: 500, height: 300 });
    toggle({ termId: "b", project: "p", label: "B" });
    resize("a", { width: 400, height: 120 });
    expect(useMiniViews.getState().views.map((v) => v.size)).toEqual([
      { width: 400, height: 120 },
      { width: 500, height: 300 },
    ]);
  });
});
