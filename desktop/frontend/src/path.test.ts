import { describe, it, expect } from "vitest";
import { joinAbs } from "./path";
import { findAgreedSlug, stripArgs } from "./peer/router";

const HOST_ROOT = "/@peer-a1b2c3d4/home/ubuntu/app";

// Where a read of the joined path is sent: the host slug, or null for this Mac.
function readTarget(absPath: string): { slug: string | null; hostPath: string } {
  return { slug: findAgreedSlug({ absPath }), hostPath: stripArgs({ absPath }).absPath as string };
}

describe("joinAbs", () => {
  it("resolves a relative path against a local base", () => {
    expect(joinAbs("/Users/dev/app", "./src/a.ts")).toBe("/Users/dev/app/src/a.ts");
    expect(joinAbs("/Users/dev/app", "/etc/hosts")).toBe("/etc/hosts");
    expect(joinAbs("/Users/dev/app", "~/notes.md")).toBe("~/notes.md");
  });

  it("keeps a relative path on the host its base lives on", () => {
    expect(readTarget(joinAbs(HOST_ROOT, "src/a.ts"))).toEqual({
      slug: "a1b2c3d4",
      hostPath: "/home/ubuntu/app/src/a.ts",
    });
  });

  it("keeps an absolute path on the host its base lives on", () => {
    expect(readTarget(joinAbs(HOST_ROOT, "/var/log/app.log"))).toEqual({
      slug: "a1b2c3d4",
      hostPath: "/var/log/app.log",
    });
  });

  it("keeps a home-relative path on the host, for the host to expand", () => {
    expect(readTarget(joinAbs(HOST_ROOT, "~/.lpm/memory/app/plan.md"))).toEqual({
      slug: "a1b2c3d4",
      hostPath: "~/.lpm/memory/app/plan.md",
    });
  });
});
