import { describe, expect, it } from "vitest";
import { accountNote } from "./sidebarUsageNote";

const inUse = { current: "acc-work", standby: ["acc-home"] };

describe("accountNote", () => {
  it("tags the project's account in use when no Claude tab is on screen", () => {
    expect(accountNote("acc-work", inUse, null, "api")).toEqual({
      mark: "current",
      text: "New Claude sessions in api use this account",
    });
    expect(accountNote("acc-home", inUse, null, "api")?.mark).toBe("standby");
    expect(accountNote("default", inUse, null, "api")).toBeUndefined();
  });

  it("keeps one in use tag when the tab on screen runs on the project's account", () => {
    expect(accountNote("acc-work", inUse, "acc-work", "api")).toEqual({
      mark: "current",
      text: "The tab on screen and new Claude sessions in api use this account",
    });
    expect(accountNote("acc-home", inUse, "acc-work", "api")?.mark).toBe("standby");
  });

  it("splits the tags when the tab on screen runs on another account", () => {
    expect(accountNote("default", inUse, "default", "api")).toEqual({
      mark: "tab",
      text: "The tab on screen uses this account",
    });
    expect(accountNote("acc-work", inUse, "default", "api")).toEqual({
      mark: "next",
      text: "New Claude sessions in api use this account",
    });
  });

  it("lets the tab outrank the pool tag", () => {
    expect(accountNote("acc-home", inUse, "acc-home", "api")?.mark).toBe("tab");
  });

  it("still marks the tab when the project's account is unknown", () => {
    expect(accountNote("acc-home", null, "acc-home", "api")?.mark).toBe("tab");
    expect(accountNote("acc-work", null, "acc-home", "api")).toBeUndefined();
  });
});
