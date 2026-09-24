import { describe, expect, it } from "vitest";
import type { ScheduledPrompt } from "../store/sendLater";
import { layoutStrip } from "./stripLayout";
import { buildScale } from "./timeline";
import { HOUR, MINUTE } from "./time";

const NOW = new Date(2026, 8, 24, 14, 48).getTime();
const scale = buildScale(NOW);

const prompt = (id: string, dueAt: number, state: ScheduledPrompt["state"] = "scheduled"): ScheduledPrompt => ({
  id,
  projectName: "lpm",
  historyKey: "k",
  terminalLabel: "Claude",
  agent: "claude",
  text: id,
  images: {},
  dueAt,
  createdAt: 0,
  state,
  kind: "time",
  force: false,
});

describe("layoutStrip", () => {
  it("puts waiting and missed prompts at now and scheduled ones on the line", () => {
    const groups = layoutStrip(
      [prompt("later", NOW + 2 * HOUR), prompt("waiting", NOW - MINUTE, "due")],
      scale,
      400,
    );
    expect(groups.map((g) => g.items[0].id)).toEqual(["waiting", "later"]);
    expect(groups[0].x).toBe(0);
    expect(groups[1].x).toBeGreaterThan(0);
  });

  it("pins prompts past the line's end to its right edge, together", () => {
    const friday = new Date(2026, 8, 25, 9).getTime() + 24 * HOUR;
    const groups = layoutStrip([prompt("a", friday), prompt("b", friday + HOUR)], scale, 400);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ x: 1, pinned: true });
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("folds a dot at the line's end into the pin there", () => {
    const tomorrow9 = new Date(2026, 8, 25, 9, 50).getTime();
    const sunday = tomorrow9 + 3 * 24 * HOUR;
    const groups = layoutStrip([prompt("a", tomorrow9), prompt("b", sunday)], scale, 400);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ x: 1, pinned: true });
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("folds a dot under the pin's label into the pin", () => {
    const tomorrow9 = new Date(2026, 8, 25, 9).getTime();
    const sunday = tomorrow9 + 3 * 24 * HOUR;
    const groups = layoutStrip(
      [prompt("soon", NOW + HOUR), prompt("a", tomorrow9), prompt("b", sunday)],
      scale,
      640,
    );
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([["soon"], ["a", "b"]]);
    expect(groups[1]).toMatchObject({ x: 1, pinned: true });
    expect(groups[0].room).toBeCloseTo((1 - groups[0].x) * 640 - 110);
  });

  it("folds dots too close to tell apart", () => {
    const groups = layoutStrip(
      [prompt("a", NOW + 2 * HOUR), prompt("b", NOW + 2 * HOUR + MINUTE), prompt("c", NOW + 3 * HOUR)],
      scale,
      400,
    );
    expect(groups.map((g) => g.items.length)).toEqual([2, 1]);
    expect(groups[0].room).toBeGreaterThan(0);
  });
});
