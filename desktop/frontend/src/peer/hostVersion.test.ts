import { describe, expect, it } from "vitest";
import { isHostBehind } from "./hostVersion";

describe("isHostBehind", () => {
  it("spots an older host", () => {
    expect(isHostBehind("1.2.3", "1.2.4")).toBe(true);
    expect(isHostBehind("1.2.3", "1.3.0")).toBe(true);
    expect(isHostBehind("1.2.3", "2.0.0")).toBe(true);
  });

  it("says nothing when the host is level or ahead", () => {
    expect(isHostBehind("1.2.3", "1.2.3")).toBe(false);
    expect(isHostBehind("1.3.0", "1.2.9")).toBe(false);
  });

  // Offering to restart someone's server — ending its agents — on a version we
  // can't actually order would be the worst kind of wrong.
  it("stays quiet on anything it cannot order", () => {
    expect(isHostBehind("", "1.2.3")).toBe(false);
    expect(isHostBehind("dev", "1.2.3")).toBe(false);
    expect(isHostBehind("1.2.3", "dev")).toBe(false);
    expect(isHostBehind("1.2", "1.2.3")).toBe(false);
  });

  // Release tags carry a v; the app reports bare numbers. Same version either way.
  it("ignores a leading v", () => {
    expect(isHostBehind("v1.2.3", "1.2.4")).toBe(true);
    expect(isHostBehind("v1.2.4", "1.2.4")).toBe(false);
  });

  // 10 is not less than 9.
  it("compares numerically, not as text", () => {
    expect(isHostBehind("1.9.0", "1.10.0")).toBe(true);
    expect(isHostBehind("1.10.0", "1.9.0")).toBe(false);
  });
});
