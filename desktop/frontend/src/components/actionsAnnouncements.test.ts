import { describe, expect, it } from "vitest";
import type { Active, Over } from "@dnd-kit/core";
import { announcements } from "./actionsAnnouncements";
import { groupDropId, zoneGroup, zoneItemId } from "./actionsDndLayout";

const active = (id: string) => ({ id }) as Active;
const over = (id: string) => ({ id }) as Over;

describe("drag announcements", () => {
  it("name a dragged zone by its name", () => {
    const zone = active(zoneItemId("tools"));
    expect(announcements.onDragStart({ active: zone })).toBe("Picked up the tools zone.");
    expect(announcements.onDragOver({ active: zone, over: over("lint") })).toBe(
      "The tools zone is over lint.",
    );
    expect(announcements.onDragEnd({ active: zone, over: over(zoneItemId("agents")) })).toBe(
      "The tools zone was dropped on the agents zone.",
    );
    expect(announcements.onDragCancel({ active: zone, over: null })).toBe(
      "Action drag cancelled. The tools zone returned to its original position.",
    );
  });

  it("read the same as before for buttons", () => {
    const button = active("lint");
    expect(announcements.onDragStart({ active: button })).toBe("Picked up action lint.");
    expect(announcements.onDragOver({ active: button, over: over(groupDropId(zoneGroup("tools"))) })).toBe(
      "Action lint is over the tools zone.",
    );
    expect(announcements.onDragOver({ active: button, over: null })).toBe(
      "Action lint is no longer over a drop zone.",
    );
    expect(announcements.onDragEnd({ active: button, over: over(groupDropId("footer")) })).toBe(
      "Action lint was dropped on the footer row.",
    );
    expect(announcements.onDragEnd({ active: button, over: null })).toBe("Action lint was dropped.");
    expect(announcements.onDragCancel({ active: button, over: null })).toBe(
      "Action drag cancelled. Action lint returned to its original position.",
    );
  });
});
