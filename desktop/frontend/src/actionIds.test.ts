import { describe, expect, it } from "vitest";
import { splitChild, isChildId, parsePath, parentPath, leafKey } from "./actionIds";

describe("actionIds path helpers", () => {
  it("splitChild splits on the LAST colon", () => {
    expect(splitChild("a:b:c")).toEqual({ parent: "a:b", child: "c" });
    expect(splitChild("a:b")).toEqual({ parent: "a", child: "b" });
    expect(splitChild("a")).toBeNull();
  });
  it("parsePath / parentPath / leafKey", () => {
    expect(parsePath("a:b:c")).toEqual(["a", "b", "c"]);
    expect(parentPath("a:b:c")).toBe("a:b");
    expect(parentPath("a")).toBeNull();
    expect(leafKey("a:b:c")).toBe("c");
    expect(leafKey("a")).toBe("a");
  });
  it("isChildId unchanged", () => {
    expect(isChildId("a:b")).toBe(true);
    expect(isChildId("a")).toBe(false);
  });
});
