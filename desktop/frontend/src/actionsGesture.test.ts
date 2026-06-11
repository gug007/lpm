import { describe, it, expect } from "vitest";
import { detectGesture, type GestureInput } from "./actionsGesture";

const base: GestureInput = {
  draggedId: "loose",
  draggedIsMenu: false,
  overNestTarget: null,
  overItemId: null,
  sameLevel: true,
};

describe("detectGesture", () => {
  it("leaf onto a nest target -> nest", () => {
    expect(detectGesture({ ...base, overNestTarget: "build" })).toEqual({
      kind: "nest", source: "loose", target: "build",
    });
  });

  it("menu onto a nest target -> merge", () => {
    expect(detectGesture({ ...base, draggedId: "m", draggedIsMenu: true, overNestTarget: "build" })).toEqual({
      kind: "merge", source: "m", target: "build",
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

  it("child onto a sibling in the same menu -> reorderMenu", () => {
    expect(detectGesture({ ...base, draggedId: "menu:a", overItemId: "menu:b" })).toEqual({
      kind: "reorderMenu", parent: "menu", child: "a", over: "b",
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
});
