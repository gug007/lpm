import { describe, expect, it } from "vitest";
import { diskSummary, folderKinds, freeableBytes, isLow, parseDiskSpace } from "./diskSpace";

const GB = 1024 ** 3;

describe("isLow", () => {
  it("calls under a tenth of the disk low", () => {
    expect(isLow({ free: 9 * GB, total: 100 * GB, clones: false })).toBe(true);
    expect(isLow({ free: 11 * GB, total: 100 * GB, clones: false })).toBe(false);
  });

  it("counts what the copies would take", () => {
    expect(isLow({ free: 15 * GB, total: 100 * GB, clones: false }, 6 * GB)).toBe(true);
  });

  it("never calls an unread disk low", () => {
    expect(isLow({ free: 0, total: 0, clones: false })).toBe(false);
  });
});

describe("folderKinds", () => {
  it("names each kind once, biggest first", () => {
    const a = { bytes: 0, running: false, freeable: [{ path: "node_modules", bytes: 5 }, { path: "web/.next", bytes: 9 }] };
    const b = { bytes: 0, running: false, freeable: [{ path: "packages\\ui\\node_modules", bytes: 7 }] };
    expect(folderKinds([a, null, b])).toEqual(["node_modules", ".next"]);
    expect(freeableBytes(a)).toBe(14);
  });
});

describe("parseDiskSpace", () => {
  it("takes only a well-formed answer", () => {
    expect(parseDiskSpace({ free: 1, total: 2 })).toEqual({ free: 1, total: 2, clones: false });
    expect(parseDiskSpace(null)).toBeNull();
    expect(parseDiskSpace({ free: "1" })).toBeNull();
  });

  it("warns in the summary when low", () => {
    expect(diskSummary({ free: 3 * GB, total: 100 * GB, clones: false })).toBe("Low on space: 3 GB free of 100 GB");
  });
});
