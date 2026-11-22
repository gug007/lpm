import { describe, expect, it } from "vitest";
import { reorderedTabs } from "./useAgentRowDrag";

describe("reorderedTabs", () => {
  it("moves the tab to sit before the one it was dropped on", () => {
    expect(reorderedTabs(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("dropped below the last line, it goes last", () => {
    expect(reorderedTabs(["a", "b", "c"], "a", null)).toEqual(["b", "c", "a"]);
  });

  it("dropped where it already was, nothing changes", () => {
    expect(reorderedTabs(["a", "b", "c"], "b", "c")).toEqual(["a", "b", "c"]);
  });
});
