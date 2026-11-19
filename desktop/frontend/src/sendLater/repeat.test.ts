import { describe, expect, it } from "vitest";
import { repeatLabel } from "./repeat";
import { DAY, HOUR, MINUTE } from "./time";

describe("repeatLabel", () => {
  it("names how often a prompt goes out again", () => {
    expect(repeatLabel(30 * MINUTE)).toBe("every 30 min");
    expect(repeatLabel(HOUR)).toBe("every hour");
    expect(repeatLabel(3 * HOUR)).toBe("every 3 hours");
    expect(repeatLabel(DAY)).toBe("every day");
  });

  it("is nothing for a prompt sent once", () => {
    expect(repeatLabel(0)).toBeNull();
    expect(repeatLabel(undefined)).toBeNull();
  });
});
