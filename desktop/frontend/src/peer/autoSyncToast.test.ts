import { describe, it, expect } from "vitest";
import { autoSyncToast, ERROR_TOAST_GAP_MS, type AutoSyncResult } from "./autoSyncToast";

function result(over: Partial<AutoSyncResult> = {}): AutoSyncResult {
  return { slug: "aa", applied: 0, pushed: 0, errors: [], conflicts: [], ...over };
}

describe("autoSyncToast", () => {
  it("says nothing for a clean run", () => {
    expect(autoSyncToast(result({ applied: 3, pushed: 1 }), "Studio", undefined, 0)).toBeNull();
    expect(autoSyncToast(result(), "Studio", undefined, 0)).toBeNull();
  });

  it("surfaces a single conflict with the item name", () => {
    const t = autoSyncToast(result({ conflicts: ["web"] }), "Studio", undefined, 0);
    expect(t).toEqual({
      kind: "conflict",
      message: "'web' changed on both Macs — kept the newer change. Backup saved.",
    });
  });

  it("summarizes multiple conflicts by count", () => {
    const t = autoSyncToast(result({ conflicts: ["web", "api"] }), "Studio", undefined, 0);
    expect(t?.kind).toBe("conflict");
    expect(t?.message).toBe(
      "2 items changed on both Macs — kept the newer changes. Backup saved.",
    );
  });

  it("surfaces an error and names the Mac", () => {
    const t = autoSyncToast(result({ errors: ["web: boom"] }), "Studio", undefined, 0);
    expect(t).toEqual({
      kind: "error",
      message: "Couldn't finish syncing with Studio. It'll keep trying.",
    });
  });

  it("prefers the error over a conflict in the same run", () => {
    const t = autoSyncToast(
      result({ errors: ["x"], conflicts: ["web"] }),
      "Studio",
      undefined,
      0,
    );
    expect(t?.kind).toBe("error");
  });

  it("throttles repeat error toasts per peer, then allows one after the gap", () => {
    // An error shown at t=1000 suppresses another within the gap.
    expect(autoSyncToast(result({ errors: ["x"] }), "Studio", 1000, 1000 + 5_000)).toBeNull();
    // After the gap it surfaces again.
    const later = 1000 + ERROR_TOAST_GAP_MS;
    expect(autoSyncToast(result({ errors: ["x"] }), "Studio", 1000, later)?.kind).toBe("error");
  });

  it("does not throttle conflicts", () => {
    // A conflict is not gated by the error timestamp.
    const t = autoSyncToast(result({ conflicts: ["web"] }), "Studio", 999_999_999, 1000);
    expect(t?.kind).toBe("conflict");
  });
});
