import { describe, expect, it, vi } from "vitest";
import type { CollisionDetection } from "@dnd-kit/core";
import { type HeldCollision, holdWhilePointerStill } from "./holdWhilePointerStill";

type Args = Parameters<CollisionDetection>[0];

const args = (x: number | null, y = 0, measured = true): Args =>
  ({
    active: { id: "menu:a" },
    pointerCoordinates: x === null ? null : { x, y },
    droppableRects: new Map(measured ? [["row", {}]] : []),
  }) as unknown as Args;

function setup() {
  let calls = 0;
  const detect = vi.fn<CollisionDetection>(() => [{ id: `answer-${++calls}` }]);
  const held: { current: HeldCollision | null } = { current: null };
  return { detect, held, hold: holdWhilePointerStill(detect, held) };
}

describe("holdWhilePointerStill", () => {
  it("answers fresh while the pointer moves", () => {
    const { hold, detect } = setup();
    expect(hold(args(1))[0].id).toBe("answer-1");
    expect(hold(args(2))[0].id).toBe("answer-2");
    expect(detect).toHaveBeenCalledTimes(2);
  });

  it("repeats its last answer while the pointer stands still", () => {
    const { hold, detect } = setup();
    const first = hold(args(5, 7));
    expect(hold(args(5, 7))).toBe(first);
    expect(hold(args(5, 7))).toBe(first);
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it("answers fresh again once the pointer moves, on either axis", () => {
    const { hold, detect } = setup();
    hold(args(5, 7));
    expect(hold(args(5, 8))[0].id).toBe("answer-2");
    expect(hold(args(6, 8))[0].id).toBe("answer-3");
    expect(detect).toHaveBeenCalledTimes(3);
  });

  it("does not hold an answer given before any droppable was measured", () => {
    const { hold, detect } = setup();
    hold(args(5, 7, false));
    expect(hold(args(5, 7))[0].id).toBe("answer-2");
    expect(detect).toHaveBeenCalledTimes(2);
  });

  it("starts over once the held answer is cleared", () => {
    const { hold, held } = setup();
    hold(args(5, 7));
    held.current = null;
    expect(hold(args(5, 7))[0].id).toBe("answer-2");
  });

  it("answers afresh for a still pointer once its key changes", () => {
    let key = "a";
    const detect = vi.fn<CollisionDetection>(() => [{ id: `answer-${key}` }]);
    const hold = holdWhilePointerStill(detect, { current: null }, () => key);
    hold(args(5, 7));
    expect(hold(args(5, 7))[0].id).toBe("answer-a");
    key = "b";
    expect(hold(args(5, 7))[0].id).toBe("answer-b");
    expect(detect).toHaveBeenCalledTimes(2);
  });

  it("passes through when there are no pointer coordinates", () => {
    const { hold, detect } = setup();
    hold(args(null));
    hold(args(null));
    expect(detect).toHaveBeenCalledTimes(2);
  });
});
