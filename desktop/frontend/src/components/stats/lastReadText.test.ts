import { describe, expect, it } from "vitest";
import { lastReadText } from "./limitsFormat";

const MIN = 60_000;

describe("lastReadText", () => {
  it("says minutes, hours and days in words", () => {
    expect(lastReadText(0, 1 * MIN)).toBe("Last read 1 minute ago");
    expect(lastReadText(0, 90 * MIN)).toBe("Last read 2 hours ago");
    expect(lastReadText(0, 26 * 60 * MIN)).toBe("Last read 1 day ago");
  });

  it("never says zero", () => {
    expect(lastReadText(0, 0)).toBe("Last read 1 minute ago");
  });
});
