import { describe, expect, it } from "vitest";
import { normalizeStatuses } from "./accounts";

describe("normalizeStatuses", () => {
  it("keeps which earlier profile holds the same login", () => {
    const out = normalizeStatuses({
      statuses: [
        { id: "default", signedIn: true, email: "main" },
        { id: "second", signedIn: true, email: "main", sameAs: "default" },
      ],
    });
    expect(out.second.sameAs).toBe("default");
    expect(out.default.sameAs).toBeUndefined();
  });
});
