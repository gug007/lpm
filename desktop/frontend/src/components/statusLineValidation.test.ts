import { describe, expect, it } from "vitest";
import {
  customStatusLineError,
  statusLineIconError,
  statusLineLabelError,
  statusLineSeparatorError,
  statusLineTextError,
} from "./statusLineValidation";
import type { CustomSpec } from "./statusLineTypes";

const validSpec: CustomSpec = {
  segments: [{ id: "folder", color: "default", text: "" }],
  separator: "·",
  meterStyle: "percent",
  meterWidth: 7,
  icons: true,
  gitStatus: false,
};

describe("status line validation", () => {
  it("accepts safe text and Unicode separators", () => {
    expect(statusLineTextError("shipping mode")).toBeNull();
    expect(statusLineLabelError("ctx")).toBeNull();
    expect(statusLineLabelError("")).toBeNull();
    expect(statusLineSeparatorError("→")).toBeNull();
    expect(customStatusLineError(validSpec)).toBeNull();
  });

  it("rejects malformed value labels", () => {
    expect(statusLineLabelError(" ctx")).toContain("spaces");
    expect(statusLineLabelError("   ")).toContain("visible text");
    expect(statusLineLabelError("x\ny")).toContain("Control characters");
    expect(statusLineLabelError("123456789012345678901234567890123")).toContain(
      "32 characters",
    );
  });

  it("rejects shell-sensitive custom text", () => {
    expect(statusLineTextError("cost $5")).toContain("dollar signs");
    expect(
      customStatusLineError({
        ...validSpec,
        segments: [{ id: "text", color: "default", text: "`deploy`" }],
      }),
    ).toContain("backticks");
    expect(
      customStatusLineError({
        ...validSpec,
        segments: [
          { id: "ctx", color: "default", text: "", label: "cost $5" },
        ],
      }),
    ).toContain("dollar signs");
  });

  it("accepts emoji icons and rejects unsafe or overlong overrides", () => {
    expect(statusLineIconError("👨‍👩‍👧‍👦")).toBeNull();
    expect(statusLineIconError("")).toBeNull();
    expect(statusLineIconError("$HOME")).toContain("dollar signs");
    expect(statusLineIconError("12345678901234567")).toContain("short symbol");
    expect(
      customStatusLineError({
        ...validSpec,
        segments: [
          { id: "folder", color: "default", text: "", icon: "`pwd`" },
        ],
      }),
    ).toContain("backticks");
  });

  it("requires one item and a one-to-three character separator", () => {
    expect(customStatusLineError({ ...validSpec, segments: [] })).toContain(
      "at least one item",
    );
    expect(
      customStatusLineError({
        ...validSpec,
        segments: [{ id: "text", color: "default", text: "   " }],
      }),
    ).toContain("at least one item");
    expect(statusLineSeparatorError("")).toContain("1 to 3 characters");
    expect(statusLineSeparatorError("abcd")).toContain("1 to 3 characters");
  });
});
