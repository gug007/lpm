import { describe, expect, it } from "vitest";
import { normalizeWorkStatusesConfig } from "./workStatuses";

describe("normalizeWorkStatusesConfig", () => {
  it("keeps well-formed rows and string keys, and treats anything else as absent", () => {
    expect(
      normalizeWorkStatusesConfig({
        custom: [
          { label: " QA ", emoji: "🧪", withNote: true },
          { label: "Hotfix", emoji: "🔥", withNote: "yes" },
          { label: "   ", emoji: "🧪" },
          { emoji: "🧪" },
          "nope",
        ],
        order: ["in_progress", 7, "custom:QA"],
      }),
    ).toEqual({
      custom: [
        { label: "QA", emoji: "🧪", withNote: true },
        { label: "Hotfix", emoji: "🔥" },
      ],
      order: ["in_progress", "custom:QA"],
    });
    expect(normalizeWorkStatusesConfig({ custom: [], order: [] })).toEqual({ custom: [] });
  });

  it("keeps only the user's own: a missing key is empty and shipped names are dropped", () => {
    expect(normalizeWorkStatusesConfig({})).toEqual({ custom: [] });
    expect(normalizeWorkStatusesConfig(null)).toEqual({ custom: [] });
    expect(normalizeWorkStatusesConfig("junk")).toEqual({ custom: [] });
    expect(
      normalizeWorkStatusesConfig({
        custom: [
          { label: "Review", emoji: "👀", withNote: true },
          { label: "QA", emoji: "🧪" },
          { label: " paused ", emoji: "⏸️" },
        ],
      }),
    ).toEqual({ custom: [{ label: "QA", emoji: "🧪" }] });
  });
});
