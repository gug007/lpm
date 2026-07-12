import { describe, it, expect } from "vitest";
import {
  parsePeerMarker,
  isPeerName,
  isPeerRoot,
  isPeerMarked,
  peerSlugOf,
  prefixName,
  prefixRoot,
  stripMarker,
  peerRawName,
} from "./markers";

const SLUG = "a1b2c3d4";

describe("peer markers", () => {
  it("round-trips a project name", () => {
    const marked = prefixName(SLUG, "my-project");
    expect(marked).toBe("peer-a1b2c3d4-my-project");
    expect(isPeerName(marked)).toBe(true);
    expect(isPeerRoot(marked)).toBe(false);
    expect(peerSlugOf(marked)).toBe(SLUG);
    expect(stripMarker(marked)).toBe("my-project");
    expect(peerRawName(marked)).toBe("my-project");
  });

  it("round-trips a project root, keeping it absolute-looking", () => {
    const marked = prefixRoot(SLUG, "/Users/dev/code/app");
    expect(marked).toBe("/@peer-a1b2c3d4/Users/dev/code/app");
    expect(isPeerRoot(marked)).toBe(true);
    expect(isPeerName(marked)).toBe(false);
    expect(marked.startsWith("/")).toBe(true);
    expect(peerSlugOf(marked)).toBe(SLUG);
    expect(stripMarker(marked)).toBe("/Users/dev/code/app");
  });

  it("preserves raw names containing hyphens and dots", () => {
    const raw = "web-app.v2-copy-3";
    expect(stripMarker(prefixName(SLUG, raw))).toBe(raw);
  });

  it("parses both forms and rejects non-markers", () => {
    expect(parsePeerMarker(prefixName(SLUG, "x"))).toEqual({ slug: SLUG, raw: "x", kind: "name" });
    expect(parsePeerMarker(prefixRoot(SLUG, "/p"))).toEqual({ slug: SLUG, raw: "/p", kind: "root" });
    expect(parsePeerMarker("plain-name")).toBeNull();
    expect(parsePeerMarker("/Users/local/app")).toBeNull();
    expect(parsePeerMarker("peer-XYZ-not-hex")).toBeNull();
    expect(parsePeerMarker(42)).toBeNull();
    expect(isPeerMarked("plain")).toBe(false);
  });

  it("leaves unmarked values unchanged when stripping", () => {
    expect(stripMarker("local-project")).toBe("local-project");
    expect(peerRawName("local-project")).toBe("local-project");
  });
});
