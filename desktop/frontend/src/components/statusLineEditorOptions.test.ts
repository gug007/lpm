import { describe, expect, it } from "vitest";
import { ansiColors } from "./terminal-colors";
import { statusLineColorValue } from "./statusLineEditorOptions";

describe("statusLineColorValue", () => {
  it("uses the terminal link blue", () => {
    expect(statusLineColorValue("blue")).toBe(ansiColors.brightBlue);
  });
});
