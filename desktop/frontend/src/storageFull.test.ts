import { describe, expect, it } from "vitest";
import { isStorageFull } from "./storageFull";

describe("isStorageFull", () => {
  it("knows a full disk however the refusal is worded", () => {
    const refusals = [
      'No space left on device (os error 28) at path "/Users/alice/.lpm/.tmps1Msgr"',
      new Error("There is not enough space on the disk. (os error 112)"),
      "Disk quota exceeded (os error 69)",
      new Error("database or disk is full"),
      "Could not add the zone: write /srv/app/.lpm.yml: no space left on device",
    ];
    for (const reason of refusals) expect(isStorageFull(reason)).toBe(true);
  });

  it("leaves every other failure alone", () => {
    const others = ["Permission denied (os error 13)", new Error("boom"), "Host is down (os error 112)", undefined, 28];
    for (const reason of others) expect(isStorageFull(reason)).toBe(false);
  });
});
