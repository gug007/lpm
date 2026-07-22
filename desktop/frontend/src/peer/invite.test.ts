import { describe, it, expect } from "vitest";
import { encodeInvite, decodeInvite, type PeerInvite } from "./invite";

const SAMPLE: PeerInvite = {
  hosts: ["192.168.1.20", "mac.tailnet.ts.net"],
  port: 8766,
  code: "428913",
};

const PINNED: PeerInvite = {
  hosts: ["10.0.0.5"],
  port: 8766,
  code: "428913",
  fp: "a".repeat(64),
};

describe("invite codec", () => {
  it("round-trips a full invite", () => {
    const s = encodeInvite(SAMPLE);
    expect(s.startsWith("lpm-pair:")).toBe(true);
    expect(decodeInvite(s)).toEqual(SAMPLE);
  });

  it("round-trips an invite carrying a fingerprint", () => {
    const s = encodeInvite(PINNED);
    expect(decodeInvite(s)).toEqual(PINNED);
  });

  it("emits a v:2 payload", () => {
    const s = encodeInvite(SAMPLE);
    const b64 = s.slice("lpm-pair:".length).replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    expect(JSON.parse(atob(b64 + pad)).v).toBe(2);
  });

  it("tolerates surrounding whitespace and newlines", () => {
    const s = encodeInvite(SAMPLE);
    expect(decodeInvite(`\n  ${s}\t\n`)).toEqual(SAMPLE);
  });

  it("accepts the payload with or without the prefix", () => {
    const s = encodeInvite(SAMPLE);
    const withoutPrefix = s.slice("lpm-pair:".length);
    expect(decodeInvite(withoutPrefix)).toEqual(SAMPLE);
  });

  it("preserves a single-host invite", () => {
    const one: PeerInvite = { hosts: ["10.0.0.5"], port: 9000, code: "000111" };
    expect(decodeInvite(encodeInvite(one))).toEqual(one);
  });

  it("parses a legacy v:1 invite as unpinned", () => {
    const v1 = "lpm-pair:" + btoa(JSON.stringify({ v: 1, h: ["10.0.0.5"], p: 8766, c: "428913" }));
    expect(decodeInvite(v1)).toEqual({ hosts: ["10.0.0.5"], port: 8766, code: "428913" });
  });

  it("parses a v:2 invite without f as unpinned", () => {
    const v2 = "lpm-pair:" + btoa(JSON.stringify({ v: 2, h: ["10.0.0.5"], p: 8766, c: "428913" }));
    const decoded = decodeInvite(v2);
    expect(decoded).toEqual({ hosts: ["10.0.0.5"], port: 8766, code: "428913" });
    expect(decoded?.fp).toBeUndefined();
  });

  it("ignores unknown fields", () => {
    const extra =
      "lpm-pair:" +
      btoa(JSON.stringify({ v: 2, h: ["10.0.0.5"], p: 8766, c: "428913", z: "future", f: "bb" }));
    expect(decodeInvite(extra)).toEqual({
      hosts: ["10.0.0.5"],
      port: 8766,
      code: "428913",
      fp: "bb",
    });
  });

  it("rejects garbage and malformed payloads", () => {
    expect(decodeInvite("")).toBeNull();
    expect(decodeInvite("   ")).toBeNull();
    expect(decodeInvite("lpm-pair:")).toBeNull();
    expect(decodeInvite("not base64 !!!")).toBeNull();
    expect(decodeInvite("hello world")).toBeNull();
    expect(decodeInvite(42)).toBeNull();
    expect(decodeInvite(null)).toBeNull();
  });

  it("rejects a valid base64 payload that isn't a known invite version", () => {
    const wrongVersion = "lpm-pair:" + btoa(JSON.stringify({ v: 3, h: ["x"], p: 1, c: "1" }));
    expect(decodeInvite(wrongVersion)).toBeNull();
    const missingCode = "lpm-pair:" + btoa(JSON.stringify({ v: 2, h: ["x"], p: 1 }));
    expect(decodeInvite(missingCode)).toBeNull();
    const emptyHosts = "lpm-pair:" + btoa(JSON.stringify({ v: 2, h: [], p: 1, c: "1" }));
    expect(decodeInvite(emptyHosts)).toBeNull();
  });
});
