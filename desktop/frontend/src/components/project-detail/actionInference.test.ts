import { describe, expect, it } from "vitest";
import { applyAutoSettings, inferRunMode } from "./actionInference";

describe("inferRunMode", () => {
  it("matches terminal keywords", () => {
    expect(inferRunMode("tail -f log.txt")).toBe("terminal");
  });

  it("matches background keywords", () => {
    expect(inferRunMode("npm run build")).toBe("background");
  });

  it("returns null when nothing matches so the caller can fall back", () => {
    expect(inferRunMode("hello world")).toBeNull();
  });
});

describe("applyAutoSettings", () => {
  it("infers run mode from the text while untouched", () => {
    const patch = applyAutoSettings(
      { name: "Build", cmd: "npm run build", runModeTouched: false, confirmTouched: false },
      "terminal",
    );
    expect(patch.runMode).toBe("background");
  });

  it("falls back to the base default when no keyword matches", () => {
    expect(
      applyAutoSettings(
        { name: "Hello", cmd: "echo hi", runModeTouched: false, confirmTouched: false },
        "terminal",
      ).runMode,
    ).toBe("terminal");
    expect(
      applyAutoSettings(
        { name: "Hello", cmd: "echo hi", runModeTouched: false, confirmTouched: false },
        "once",
      ).runMode,
    ).toBe("once");
  });

  it("turns confirm on for risky text while untouched", () => {
    const patch = applyAutoSettings(
      { name: "Deploy", cmd: "npm run deploy", runModeTouched: false, confirmTouched: false },
      "terminal",
    );
    expect(patch.confirm).toBe(true);
  });

  it("turns confirm back off when the keyword is gone (auto-off)", () => {
    const patch = applyAutoSettings(
      { name: "Build", cmd: "npm run build", runModeTouched: false, confirmTouched: false },
      "terminal",
    );
    expect(patch.confirm).toBe(false);
  });

  it("never overrides an explicitly chosen run mode", () => {
    const patch = applyAutoSettings(
      { name: "Build", cmd: "npm run build", runModeTouched: true, confirmTouched: false },
      "terminal",
    );
    expect(patch.runMode).toBeUndefined();
    expect(patch.confirm).toBe(false);
  });

  it("never overrides an explicitly chosen confirm flag", () => {
    const patch = applyAutoSettings(
      { name: "Deploy", cmd: "npm run deploy", runModeTouched: false, confirmTouched: true },
      "terminal",
    );
    expect(patch.confirm).toBeUndefined();
    expect(patch.runMode).toBe("terminal");
  });

  it("emits nothing when both fields are touched", () => {
    expect(
      applyAutoSettings(
        { name: "Deploy", cmd: "npm run deploy", runModeTouched: true, confirmTouched: true },
        "terminal",
      ),
    ).toEqual({});
  });
});
