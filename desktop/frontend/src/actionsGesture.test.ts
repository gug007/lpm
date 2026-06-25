import { describe, it, expect } from "vitest";
import { detectGesture, type GestureInput } from "./actionsGesture";

const base: GestureInput = {
  draggedId: "loose",
  draggedIsMenu: false,
  overNestTarget: null,
  overItemId: null,
  sameLevel: true,
  extractTarget: null,
};

describe("detectGesture", () => {
  it("leaf onto a nest target -> nest", () => {
    expect(detectGesture({ ...base, overNestTarget: "build" })).toEqual({
      kind: "nest", source: "loose", target: "build",
    });
  });

  it("menu onto a nest target -> nest (preserve structure)", () => {
    expect(detectGesture({ ...base, draggedId: "m", draggedIsMenu: true, overNestTarget: "build" })).toEqual({
      kind: "nest", source: "m", target: "build",
    });
  });

  it("child onto a nest target -> extractOnto", () => {
    expect(detectGesture({ ...base, draggedId: "menu:a", overNestTarget: "build" })).toEqual({
      kind: "extractOnto", parent: "menu", child: "a", target: "build",
    });
  });

  it("child onto empty -> extractToTop", () => {
    expect(detectGesture({ ...base, draggedId: "menu:a" })).toEqual({
      kind: "extractToTop", parent: "menu", child: "a",
    });
  });

  it("child onto an insertion gap -> extractToTop carrying the slot", () => {
    const op = detectGesture({
      ...base,
      draggedId: "menu:a",
      extractTarget: { group: "footer", index: 2 },
    });
    expect(op).toEqual({
      kind: "extractToTop", parent: "menu", child: "a", group: "footer", index: 2,
    });
  });

  it("child onto a sibling in the same menu -> reorderMenu (no position = swap-style)", () => {
    expect(detectGesture({ ...base, draggedId: "menu:a", overItemId: "menu:b" })).toEqual({
      kind: "reorderMenu", parent: "menu", child: "a", over: "b",
    });
  });

  it("child onto a sibling's top third -> reorderMenu before", () => {
    expect(
      detectGesture({ ...base, draggedId: "menu:a", overItemId: "menu:b", reorderPosition: "before" }),
    ).toEqual({
      kind: "reorderMenu", parent: "menu", child: "a", over: "b", position: "before",
    });
  });

  it("child onto a sibling's bottom third -> reorderMenu after", () => {
    expect(
      detectGesture({ ...base, draggedId: "menu:a", overItemId: "menu:b", reorderPosition: "after" }),
    ).toEqual({
      kind: "reorderMenu", parent: "menu", child: "a", over: "b", position: "after",
    });
  });

  it("cross-level before/after drop -> extractOnto carrying over + position", () => {
    // Spring-navigated up mid-drag: the over row's parent differs from the
    // dragged child's parent, so the before/after drop moves it into that
    // level at the indicated side rather than extracting to the toolbar.
    expect(
      detectGesture({
        ...base,
        draggedId: "Build:iOS:Release",
        overItemId: "Build:Tools",
        reorderPosition: "before",
      }),
    ).toEqual({
      kind: "extractOnto",
      parent: "Build:iOS",
      child: "Release",
      target: "Build",
      over: "Tools",
      position: "before",
    });
  });

  it("cross-level drop without a before/after position -> extractToTop (drag to toolbar)", () => {
    expect(
      detectGesture({ ...base, draggedId: "Build:iOS:Release", overItemId: "Build:Tools" }),
    ).toEqual({
      kind: "extractToTop", parent: "Build:iOS", child: "Release",
    });
  });

  it("child onto a sibling's middle (nest) is routed via overNestTarget -> extractOnto", () => {
    // The drop handler maps a middle-third 'nest' to overNestTarget, not
    // overItemId, so detectGesture produces an extractOnto onto the sibling.
    expect(detectGesture({ ...base, draggedId: "menu:a", overNestTarget: "menu:b" })).toEqual({
      kind: "extractOnto", parent: "menu", child: "a", target: "menu:b",
    });
  });

  it("rejects nesting when levels differ", () => {
    expect(detectGesture({ ...base, overNestTarget: "build", sameLevel: false })).toBe(null);
  });

  it("rejects nesting onto itself", () => {
    expect(detectGesture({ ...base, draggedId: "build", overNestTarget: "build" })).toBe(null);
  });

  it("top-level leaf over a sibling item (no nest target) -> null (flat reorder)", () => {
    expect(detectGesture({ ...base, overItemId: "build" })).toBe(null);
  });

  it("top-level leaf onto empty -> null (flat reorder)", () => {
    expect(detectGesture(base)).toBe(null);
  });

  it("child onto its own parent nest target -> null", () => {
    expect(detectGesture({ ...base, draggedId: "menu:a", overNestTarget: "menu" })).toBe(null);
  });

  it("child onto a sibling's nest target -> extractOnto sibling", () => {
    expect(detectGesture({ ...base, draggedId: "menu:a", overNestTarget: "menu:b" })).toEqual({
      kind: "extractOnto", parent: "menu", child: "a", target: "menu:b",
    });
  });

  it("deep child onto a sibling's nest target -> extractOnto sibling", () => {
    expect(
      detectGesture({ ...base, draggedId: "Build:iOS:Debug", overNestTarget: "Build:iOS:Release" }),
    ).toEqual({
      kind: "extractOnto", parent: "Build:iOS", child: "Debug", target: "Build:iOS:Release",
    });
  });
});

describe("gesture: nest-preserve + cross-level", () => {
  it("dropping a menu onto a button NESTS (no merge/flatten)", () => {
    const op = detectGesture({
      draggedId: "Tools",
      draggedIsMenu: true,
      overNestTarget: "Build",
      overItemId: null,
      sameLevel: true,
      extractTarget: null,
    });
    expect(op).toEqual({ kind: "nest", source: "Tools", target: "Build" });
  });

  it("dropping a deep child on an ancestor crumb extracts onto it", () => {
    const op = detectGesture({
      draggedId: "Build:iOS:Release",
      draggedIsMenu: false,
      overNestTarget: null,
      overItemId: null,
      sameLevel: true,
      extractTarget: null,
      crumbTarget: "Build",
    });
    expect(op).toEqual({ kind: "extractOnto", parent: "Build:iOS", child: "Release", target: "Build" });
  });

  it("dropping a deep child on the toolbar crumb extracts to top", () => {
    const op = detectGesture({
      draggedId: "Build:iOS:Release",
      draggedIsMenu: false,
      overNestTarget: null,
      overItemId: null,
      sameLevel: true,
      extractTarget: { group: "header", index: 2 },
      crumbTarget: "",
    });
    expect(op).toEqual({ kind: "extractToTop", parent: "Build:iOS", child: "Release", group: "header", index: 2 });
  });

  it("dropping a deep child on its own level crumb is a no-op", () => {
    const op = detectGesture({
      draggedId: "Build:iOS:Release",
      draggedIsMenu: false,
      overNestTarget: null,
      overItemId: null,
      sameLevel: true,
      extractTarget: null,
      crumbTarget: "Build:iOS",
    });
    expect(op).toBeNull();
  });
});
