import { describe, expect, it } from "vitest";
import { cleanPrompt, echoesTitle } from "./sessionText";

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

describe("echoesTitle", () => {
  it("catches a title that only recased its prompt", () => {
    expect(echoesTitle("Linux host issue", "linux host issue")).toBe(true);
    expect(echoesTitle("Improve Resume session UI/UX", "improve Resume session UI/UX")).toBe(true);
  });

  it("catches a prompt cut short at the same words", () => {
    expect(
      echoesTitle(
        "Improve the resume session picker layout",
        "improve the resume session picker lay…",
      ),
    ).toBe(true);
  });

  it("keeps a prompt that says more than the title", () => {
    expect(
      echoesTitle(
        "Investigate reported issue on Ubuntu container",
        "user reported issue Ubuntu 22.04.4 LTS (Jammy…",
      ),
    ).toBe(false);
    expect(
      echoesTitle(
        "Improve resume session to show all sessions history",
        "can we display in resume session all sessions hsitory…",
      ),
    ).toBe(false);
    expect(
      echoesTitle("Make tab tooltip support multiple lines", "can you make tab tooltip multiple…"),
    ).toBe(false);
  });

  it("keeps a long prompt that merely opens with a short title", () => {
    expect(echoesTitle("Fix login", "fix login bug in the auth flow when the token expires")).toBe(
      false,
    );
  });

  it("treats a missing side as nothing to add", () => {
    expect(echoesTitle("Linux host issue", "")).toBe(true);
    expect(echoesTitle("", "linux host issue")).toBe(true);
  });
});
