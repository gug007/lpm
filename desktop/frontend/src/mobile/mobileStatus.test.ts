import { describe, expect, it } from "vitest";
import { ago, phoneSubtitle, sortPhones, type PhoneDevice } from "./phoneStatus";
import { isTailscaleAddress, keepAwakeText, reachHeadline, type ReachInput } from "./reachStatus";

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);
const phone = (patch: Partial<PhoneDevice>): PhoneDevice => ({
  id: "d",
  name: "iPhone",
  phoneName: "iPhone",
  createdAt: Date.UTC(2026, 7, 26, 9, 14),
  connected: false,
  route: null,
  lastSeen: 0,
  lastRoute: null,
  ...patch,
});

describe("phoneSubtitle", () => {
  it("leads with Connected now and the route while connected", () => {
    const s = phoneSubtitle(phone({ connected: true, route: "tailscale" }), NOW, "this Mac");
    expect(s.live).toBe(true);
    expect(s.lead).toBe("Connected now");
    expect(s.rest).toMatch(/^over Tailscale · paired /);
  });

  it("says when and how a phone last connected", () => {
    const s = phoneSubtitle(phone({ lastSeen: NOW - 2 * 86_400_000, lastRoute: "network" }), NOW, "this Mac");
    expect(s.rest).toMatch(/^Last connected 2 days ago · on your network · paired /);
  });

  it("names a phone that never came back after pairing", () => {
    expect(phoneSubtitle(phone({}), NOW, "this Mac").rest).toMatch(/^Not seen since pairing · paired /);
    expect(phoneSubtitle(phone({ connected: true, route: "local" }), NOW, "this Mac").rest).toMatch(/^on this Mac · /);
  });
});

describe("ago", () => {
  it("reads naturally at every scale", () => {
    expect(ago(NOW - 10_000, NOW)).toBe("just now");
    expect(ago(NOW - 60_000, NOW)).toBe("1 minute ago");
    expect(ago(NOW - 3 * 3_600_000, NOW)).toBe("3 hours ago");
    expect(ago(NOW - 30 * 3_600_000, NOW)).toBe("yesterday");
    expect(ago(NOW - 20 * 86_400_000, NOW)).toBe("2 weeks ago");
    expect(ago(NOW - 90 * 86_400_000, NOW)).toMatch(/^on /);
  });
});

describe("sortPhones", () => {
  it("puts the connected phone first, then the most recently seen", () => {
    const list = [
      phone({ id: "old", createdAt: 1 }),
      phone({ id: "seen", lastSeen: NOW - 1000 }),
      phone({ id: "here", connected: true }),
    ];
    expect(sortPhones(list).map((p) => p.id)).toEqual(["here", "seen", "old"]);
  });
});

describe("reachHeadline", () => {
  const base: ReachInput = {
    enabled: true,
    running: true,
    bindError: null,
    tailscaleHost: null,
    tailscale: true,
    builtInRunning: false,
    deviceUsedTailscale: true,
  };

  it("says home and away once a Tailscale route is in place", () => {
    expect(reachHeadline({ ...base, builtInRunning: true }, "this Mac")).toEqual({
      tone: "live",
      label: "On · your devices reach this Mac from anywhere",
    });
    expect(reachHeadline({ ...base, tailscaleHost: "100.92.155.108" }, "this Mac").tone).toBe("live");
  });

  it("waits for a device on Tailscale before promising away from home", () => {
    expect(reachHeadline({ ...base, builtInRunning: true, deviceUsedTailscale: false }, "this Mac")).toEqual({
      tone: "live",
      label: "On · works anywhere once your phone is on Tailscale",
    });
  });

  it("is honest about home only", () => {
    expect(reachHeadline(base, "this Mac")).toEqual({ tone: "starting", label: "On · works on this network only" });
    expect(reachHeadline({ ...base, tailscaleHost: "100.92.155.108", tailscale: false }, "this Mac").label).toBe(
      "On · works on this network only",
    );
  });

  it("covers off, starting and a failed start", () => {
    expect(reachHeadline({ ...base, enabled: false }, "this Mac").tone).toBe("off");
    expect(reachHeadline({ ...base, running: false }, "this Mac").label).toBe("Starting…");
    expect(reachHeadline({ ...base, running: false, bindError: "Port in use" }, "this Mac").tone).toBe("problem");
  });
});

describe("keepAwakeText", () => {
  it("is plain about battery", () => {
    expect(keepAwakeText("battery", "this Mac")).toBe("On battery · this Mac can sleep until it's plugged in.");
  });
});

describe("isTailscaleAddress", () => {
  it("tells Tailscale addresses from home network ones", () => {
    expect(isTailscaleAddress("100.64.0.12")).toBe(true);
    expect(isTailscaleAddress("100.127.255.1")).toBe(true);
    expect(isTailscaleAddress("mac.tail1234.ts.net")).toBe(true);
    expect(isTailscaleAddress("100.128.0.1")).toBe(false);
    expect(isTailscaleAddress("192.168.1.20")).toBe(false);
    expect(isTailscaleAddress("mac.local")).toBe(false);
  });
});
