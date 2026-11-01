import { describe, expect, it } from "vitest";
import { EMPTY_READY, readyDraftError, readyDraftFrom, readyPayload, type ReadyDraft } from "./serviceReady";

const draft = (kind: ReadyDraft["kind"], value = "", timeout = ""): ReadyDraft => ({ kind, value, timeout });

describe("service ready fields", () => {
  it("write the short form a person would type", () => {
    expect(readyPayload(draft("port"))).toBe("port");
    expect(readyPayload(draft("port", "4001"))).toBe(4001);
    expect(readyPayload(draft("url", " http://localhost:3000/health "))).toBe("http://localhost:3000/health");
    expect(readyPayload(draft("log", "ready in"))).toEqual({ log: "ready in" });
    expect(readyPayload(draft("", "anything"))).toBeUndefined();
  });

  it("switch to the mapping only for a timeout other than 30s", () => {
    expect(readyPayload(draft("port", "", "60"))).toEqual({ port: true, timeout: 60 });
    expect(readyPayload(draft("port", "4001", "60"))).toEqual({ port: 4001, timeout: 60 });
    expect(readyPayload(draft("url", "https://x.test", "5"))).toEqual({ url: "https://x.test", timeout: 5 });
    expect(readyPayload(draft("log", "up", "30"))).toEqual({ log: "up" });
  });

  it("read back what the app parsed", () => {
    expect(readyDraftFrom({ kind: "port", port: 0, timeout: 30 })).toEqual(draft("port"));
    expect(readyDraftFrom({ kind: "port", port: 4001, timeout: 45 })).toEqual(draft("port", "4001", "45"));
    expect(readyDraftFrom({ kind: "log", log: "up", timeout: 30 })).toEqual(draft("log", "up"));
    expect(readyDraftFrom({ kind: "invalid", error: "x" })).toEqual(EMPTY_READY);
    expect(readyDraftFrom(undefined)).toEqual(EMPTY_READY);
  });

  it("say what is wrong before saving", () => {
    expect(readyDraftError(draft("port"), 0)).toMatch(/service's port/);
    expect(readyDraftError(draft("port"), 4000)).toBeNull();
    expect(readyDraftError(draft("port", "70000"), 4000)).toMatch(/1 to 65535/);
    expect(readyDraftError(draft("url", "localhost:3000"), 0)).toMatch(/http/);
    expect(readyDraftError(draft("log", "  "), 0)).toMatch(/text/);
    expect(readyDraftError(draft("log", "up", "0"), 0)).toMatch(/Timeout/);
    expect(readyDraftError(draft("log", "up", "1.5"), 0)).toMatch(/Timeout/);
    expect(readyDraftError(draft(""), 0)).toBeNull();
  });
});
