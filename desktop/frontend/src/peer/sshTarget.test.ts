import { describe, expect, it } from "vitest";
import { parseSshTarget } from "./sshTarget";

describe("parseSshTarget", () => {
  it("takes what people actually type", () => {
    expect(parseSshTarget("root@10.0.0.5")).toEqual({
      host: "10.0.0.5",
      user: "root",
      port: 0,
      key: "",
    });
  });

  // ssh works without a user (it falls back to its own config), so we should too.
  it("allows a bare host", () => {
    expect(parseSshTarget("build-box")).toEqual({
      host: "build-box",
      user: "",
      port: 0,
      key: "",
    });
  });

  it("pulls a trailing port off", () => {
    expect(parseSshTarget("root@10.0.0.5:2222")).toMatchObject({
      host: "10.0.0.5",
      port: 2222,
    });
  });

  // Port 0 means "unset" downstream, so a real port has to be in range or the
  // whole input is a typo worth rejecting.
  it("rejects a port that isn't one", () => {
    expect(parseSshTarget("root@h:0")).toBeNull();
    expect(parseSshTarget("root@h:70000")).toBeNull();
  });

  it("rejects blanks, spaces, empty users and paths", () => {
    expect(parseSshTarget("")).toBeNull();
    expect(parseSshTarget("   ")).toBeNull();
    expect(parseSshTarget("root@host extra")).toBeNull();
    expect(parseSshTarget("@host")).toBeNull();
    expect(parseSshTarget("root@host/path")).toBeNull();
  });

  // A username can contain @ (an email-style login), so the split is on the LAST
  // one — otherwise the host would come out as the tail of the username.
  it("splits on the last @ so email-style logins survive", () => {
    expect(parseSshTarget("me@corp.com@bastion")).toMatchObject({
      user: "me@corp.com",
      host: "bastion",
    });
  });
});
