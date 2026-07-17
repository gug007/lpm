import { describe, expect, it } from "vitest";
import { composerValueToText, EMPTY_COMPOSER } from "./composerValue";

const value = (text: string, images: { token: number; path: string }[] = []) => ({
  text,
  images,
  pending: false,
});

describe("composerValueToText", () => {
  it("keeps a plain prompt verbatim", () => {
    expect(composerValueToText(value("Fix the flaky test.\n\nThen ship."))).toBe(
      "Fix the flaky test.\n\nThen ship.",
    );
  });

  it("is empty for an empty value", () => {
    expect(composerValueToText(EMPTY_COMPOSER)).toBe("");
  });

  it("inlines each attachment's path where its token stood", () => {
    expect(
      composerValueToText(
        value("Match [Image #2] and\nthen[Image #1]ship it", [
          { token: 2, path: "/tmp/lpm/before.png" },
          { token: 1, path: "/tmp/lpm/after.jpeg" },
        ]),
      ),
    ).toBe("Match /tmp/lpm/before.png and\nthen /tmp/lpm/after.jpeg ship it");
  });

  it("drops a token whose image is gone", () => {
    expect(composerValueToText(value("look [Image #1] here"))).toBe("look  here");
  });

  it("trims surrounding whitespace, including around a leading attachment", () => {
    expect(
      composerValueToText(
        value("  [Image #1] describe this  ", [{ token: 1, path: "/tmp/a.png" }]),
      ),
    ).toBe("/tmp/a.png describe this");
  });
});
