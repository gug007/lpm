import { describe, expect, it } from "vitest";
import { statusLineReadingNote } from "./statusLineReadingNote";
import type { CustomSpec, SegmentId } from "./statusLineTypes";

const spec = (ids: SegmentId[]): CustomSpec => ({
  segments: ids.map((id) => ({ id, color: "default", text: "" })),
  separator: "·",
  meterStyle: "bar",
  meterWidth: 7,
  icons: false,
  gitStatus: false,
});

describe("statusLineReadingNote", () => {
  it("explains which numbers are left and which are used", () => {
    expect(statusLineReadingNote(spec(["ctx", "five", "seven", "cost"]))).toBe(
      "Context shows how much is left · 5-hour and weekly usage show how much of the limit is used, turning yellow at 50% and red at 80% · cost is an estimate at list prices.",
    );
  });

  it("uses the singular for one limit and skips lines without numbers", () => {
    expect(statusLineReadingNote(spec(["seven"]))).toBe(
      "Weekly usage shows how much of the limit is used, turning yellow at 50% and red at 80%.",
    );
    expect(statusLineReadingNote(spec(["folder", "model"]))).toBeNull();
  });
});
