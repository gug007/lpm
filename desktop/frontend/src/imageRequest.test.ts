import { describe, expect, it } from "vitest";
import { buildImageRequest } from "./imageRequest";

describe("buildImageRequest", () => {
  it("asks for the image with lpm generate, with the prompt as written", () => {
    expect(buildImageRequest("  A banana in a spacesuit \n")).toBe(
      "Make an image with `lpm generate image`: A banana in a spacesuit",
    );
  });

  it("leaves a prompt that already asks alone", () => {
    const asked = "Make an image with `lpm generate image`: A logo";
    expect(buildImageRequest(asked)).toBe(asked);
    expect(buildImageRequest(`  ${asked}`)).toBe(`  ${asked}`);
  });
});
