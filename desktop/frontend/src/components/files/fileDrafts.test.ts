import { describe, expect, it } from "vitest";
import { forgetFiles, hasUnsavedFiles, heldFiles, holdFiles } from "./fileDrafts";

const draft = new Map([["README.md", { baseline: "# Shop\n", draft: "notes # Shop\n" }]]);

describe("a Files tab's held state", () => {
  it("outlives the component and is unsaved only while a draft exists", () => {
    holdFiles("tab-1", { path: "README.md", buffers: new Map() });
    expect(heldFiles("tab-1")?.path).toBe("README.md");
    expect(hasUnsavedFiles("tab-1")).toBe(false);

    holdFiles("tab-1", { path: "README.md", buffers: draft });
    expect(hasUnsavedFiles("tab-1")).toBe(true);
    expect(heldFiles("tab-1")?.buffers.get("README.md")?.draft).toBe("notes # Shop\n");
    expect(hasUnsavedFiles("tab-2")).toBe(false);
  });

  it("is dropped with the tab, or once nothing is open", () => {
    holdFiles("tab-3", { path: "a.ts", buffers: draft });
    forgetFiles("tab-3");
    expect(heldFiles("tab-3")).toBeUndefined();

    holdFiles("tab-4", { path: "a.ts", buffers: new Map() });
    holdFiles("tab-4", { path: null, buffers: new Map() });
    expect(heldFiles("tab-4")).toBeUndefined();
  });
});
