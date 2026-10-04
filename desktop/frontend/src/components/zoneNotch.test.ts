import { describe, expect, it } from "vitest";
import { zoneNotchBackground } from "./zoneNotch";

describe("zoneNotchBackground", () => {
  it("is the frame's opaque fill above the line and the bar below it", () => {
    expect(zoneNotchBackground("header", "filled")).toBe(
      "linear-gradient(color-mix(in srgb, var(--bg-secondary) 60%, var(--bg-primary)) 50%, var(--bg-primary) 50%)",
    );
    expect(zoneNotchBackground("footer", "filled")).toBe(
      "linear-gradient(color-mix(in srgb, var(--composer-surface) 60%, var(--terminal-bg)) 50%, var(--terminal-bg) 50%)",
    );
  });

  it("is the bar all the way down when the frame has no fill", () => {
    expect(zoneNotchBackground("header", "empty")).toBe("linear-gradient(var(--bg-primary) 50%, var(--bg-primary) 50%)");
    expect(zoneNotchBackground("footer", "target")).toBe(
      "linear-gradient(var(--terminal-bg) 50%, var(--terminal-bg) 50%)",
    );
  });

  it("tints the top half while a drag is over the zone", () => {
    expect(zoneNotchBackground("header", "over")).toBe(
      "linear-gradient(color-mix(in srgb, var(--accent-blue) 6%, var(--bg-primary)) 50%, var(--bg-primary) 50%)",
    );
  });
});
