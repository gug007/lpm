import { describe, expect, it } from "vitest";
import { DEFAULT_WORK_STATUS_PALETTE } from "../workStatus";
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

  it("falls back to the shipped palette when the key is missing, but not when it is emptied", () => {
    expect(normalizeWorkStatusesConfig({})).toEqual({ custom: DEFAULT_WORK_STATUS_PALETTE });
    expect(normalizeWorkStatusesConfig(null)).toEqual({ custom: DEFAULT_WORK_STATUS_PALETTE });
    expect(normalizeWorkStatusesConfig("junk")).toEqual({ custom: DEFAULT_WORK_STATUS_PALETTE });
    expect(normalizeWorkStatusesConfig({ custom: [] })).toEqual({ custom: [] });
  });
});
