import { describe, expect, it } from "vitest";
import { parseSshEnvMismatch, sshEnvMismatchMessage } from "./sshEnvMismatch";

describe("parseSshEnvMismatch", () => {
  it("accepts a complete payload", () => {
    const m = parseSshEnvMismatch({
      hostLabel: "dev@gateway",
      execHome: "/home/dev",
      ptyHome: "/root",
    });
    expect(m).toEqual({ hostLabel: "dev@gateway", execHome: "/home/dev", ptyHome: "/root" });
  });

  it("rejects null, missing fields, and empty host", () => {
    expect(parseSshEnvMismatch(null)).toBeNull();
    expect(parseSshEnvMismatch({})).toBeNull();
    expect(parseSshEnvMismatch({ hostLabel: "dev@gateway" })).toBeNull();
    expect(
      parseSshEnvMismatch({ hostLabel: "", execHome: "/a", ptyHome: "/b" }),
    ).toBeNull();
    expect(
      parseSshEnvMismatch({ hostLabel: "dev@gateway", execHome: 1, ptyHome: "/b" }),
    ).toBeNull();
  });

  it("names the host in the message without internals", () => {
    const msg = sshEnvMismatchMessage({
      hostLabel: "dev@gateway",
      execHome: "/home/dev",
      ptyHome: "/root",
    });
    expect(msg).toContain("dev@gateway");
    expect(msg).not.toMatch(/socket|pty|exec|\$HOME/i);
  });
});
