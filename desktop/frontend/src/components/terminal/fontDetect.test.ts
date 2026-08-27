import { describe, expect, it, vi } from "vitest";

vi.mock("../../../bridge/commands", () => ({ ListMonospaceFonts: vi.fn() }));

import { mergeFontLists } from "./fontDetect";

describe("mergeFontLists", () => {
  it("sorts the union alphabetically, case-insensitive", () => {
    expect(mergeFontLists(["Menlo", "Andale Mono"], ["iosevka", "Hack"])).toEqual([
      "Andale Mono",
      "Hack",
      "iosevka",
      "Menlo",
    ]);
  });

  it("dedupes case-insensitively, keeping the installed casing", () => {
    expect(mergeFontLists(["JetBrains Mono"], ["JETBRAINS MONO", "Hack"])).toEqual([
      "Hack",
      "JetBrains Mono",
    ]);
  });

  it("falls back to the probed list when the backend returns nothing", () => {
    expect(mergeFontLists([], ["Menlo", "Hack"])).toEqual(["Hack", "Menlo"]);
  });
});
