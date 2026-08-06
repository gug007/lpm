import { describe, expect, it } from "vitest";
import { cleanPrompt } from "./sessionText";

describe("cleanPrompt", () => {
  it("has nothing to say about nothing", () => {
    expect(cleanPrompt(null)).toBe("");
    expect(cleanPrompt(undefined)).toBe("");
    expect(cleanPrompt("")).toBe("");
    expect(cleanPrompt("   ")).toBe("");
  });

  it("leaves what a person wrote alone", () => {
    expect(cleanPrompt("linux host issue")).toBe("linux host issue");
  });

  it("drops the image placeholder a paste leaves behind", () => {
    expect(cleanPrompt("[Image #1]linux host issue")).toBe("linux host issue");
    expect(cleanPrompt("look at [Image #2] and [Image #10] then fix it")).toBe(
      "look at and then fix it",
    );
  });

  it("names a prompt that was only an image", () => {
    expect(cleanPrompt("[Image #1]")).toBe("Image prompt");
    expect(cleanPrompt("  [Image #1] [Image #2]  ")).toBe("Image prompt");
  });

  it("collapses the whitespace a stripped token leaves", () => {
    expect(cleanPrompt("  fix   the\n\nlayout  ")).toBe("fix the layout");
  });
});
