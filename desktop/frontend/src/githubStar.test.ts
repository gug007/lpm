import { describe, expect, it } from "vitest";
import { githubStarAskDue } from "./githubStar";

describe("githubStarAskDue", () => {
  it("waits a week from the first day lpm was seen", () => {
    expect(githubStarAskDue("2026-10-24", "2026-10-30")).toBe(false);
    expect(githubStarAskDue("2026-10-23", "2026-10-30")).toBe(true);
  });

  it("leaves the start of the week to the weekly recap toast", () => {
    expect(githubStarAskDue("2026-10-01", "2026-10-26")).toBe(false);
    expect(githubStarAskDue("2026-10-01", "2026-10-28")).toBe(false);
    expect(githubStarAskDue("2026-10-01", "2026-10-29")).toBe(true);
    expect(githubStarAskDue("2026-10-01", "2026-11-01")).toBe(true);
  });
});
