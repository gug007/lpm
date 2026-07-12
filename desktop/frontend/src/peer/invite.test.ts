import { describe, it, expect } from "vitest";
import { encodeInvite, decodeInvite, type PeerInvite } from "./invite";

const SAMPLE: PeerInvite = {
  hosts: ["192.168.1.20", "mac.tailnet.ts.net"],
  port: 8766,
  code: "428913",
};

describe("invite codec", () => {
  it("round-trips a full invite", () => {
    const s = encodeInvite(SAMPLE);
    expect(s.startsWith("lpm-pair:")).toBe(true);
    expect(decodeInvite(s)).toEqual(SAMPLE);
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

  it("rejects garbage and malformed payloads", () => {
    expect(decodeInvite("")).toBeNull();
    expect(decodeInvite("   ")).toBeNull();
    expect(decodeInvite("lpm-pair:")).toBeNull();
    expect(decodeInvite("not base64 !!!")).toBeNull();
    expect(decodeInvite("hello world")).toBeNull();
    expect(decodeInvite(42)).toBeNull();
    expect(decodeInvite(null)).toBeNull();
  });

  it("rejects a valid base64 payload that isn't a v:1 invite", () => {
    const wrongVersion = "lpm-pair:" + btoa(JSON.stringify({ v: 2, h: ["x"], p: 1, c: "1" }));
    expect(decodeInvite(wrongVersion)).toBeNull();
    const missingCode = "lpm-pair:" + btoa(JSON.stringify({ v: 1, h: ["x"], p: 1 }));
    expect(decodeInvite(missingCode)).toBeNull();
    const emptyHosts = "lpm-pair:" + btoa(JSON.stringify({ v: 1, h: [], p: 1, c: "1" }));
    expect(decodeInvite(emptyHosts)).toBeNull();
  });
});
