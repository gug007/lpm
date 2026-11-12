import { describe, expect, it } from "vitest";
import { humanizeError, peerDownCopy, peerStatus, rttText } from "./peerStatus";
import type { PeerClient } from "./usePeerState";

const peer = (over: Partial<PeerClient> = {}): PeerClient => ({
  slug: "abcd1234",
  alias: "Studio",
  host: "10.0.0.2",
  port: 8766,
  enabled: true,
  connected: false,
  ...over,
});

describe("humanizeError", () => {
  it("says what an OS error means for the other machine", () => {
    expect(humanizeError("Operation timed out (os error 60)")).toMatch(/Not responding/);
    expect(humanizeError("Connection refused (os error 61)")).toMatch(/lpm may not be running/);
    expect(humanizeError("No route to host (os error 65)")).toMatch(/network/);
  });

  it("keeps anything it doesn't recognize verbatim", () => {
    expect(humanizeError("weird failure 1234")).toBe("weird failure 1234");
  });
});

describe("peerStatus", () => {
  it("reads off, live, and connecting straight off the peer", () => {
    expect(peerStatus(peer({ enabled: false })).text).toBe("Off");
    expect(peerStatus(peer({ connected: true })).tone).toBe("live");
    expect(peerStatus(peer()).tone).toBe("pending");
  });

  it("says how fast a live link is, and when it slows or stops answering", () => {
    const link = (health: "ok" | "slow" | "silent", rttMs: number | null) => ({ health, rttMs, waitingSecs: null });
    expect(peerStatus(peer({ connected: true, link: link("ok", 38) })).text).toBe("Connected · 38 ms");
    expect(peerStatus(peer({ connected: true, link: link("slow", 1400) }))).toEqual({
      tone: "pending",
      text: "Slow · 1.4 s round trip",
      detail: "",
    });
    const silent = peerStatus(peer({ connected: true, link: link("silent", 40) }));
    expect(silent).toMatchObject({ tone: "pending", text: "Not responding", reconnect: true });
    expect(peerStatus(peer({ connected: false, link: link("silent", 40) })).reconnect).toBeUndefined();
    expect(rttText(999)).toBe("999 ms");
  });

  it("says when the connection runs over Tailscale", () => {
    expect(peerStatus(peer({ connected: true, overTailscale: true })).text).toBe("Connected over Tailscale");
    expect(peerStatus(peer({ connected: true, overTailscale: false })).text).toBe("Connected");
  });

  it("keeps the raw error as the tooltip behind a rewritten one", () => {
    const s = peerStatus(peer({ lastError: "Operation timed out (os error 60)" }));
    expect(s.tone).toBe("error");
    expect(s.detail).toBe("Operation timed out (os error 60)");
    expect(s.text).not.toBe(s.detail);
  });

  // A dead forward and a dead host look identical and are fixed differently.
  it("blames the tunnel only while the tunnel is what's wrong", () => {
    expect(peerStatus(peer({ sshHost: "srv", tunnel: "connecting" })).text).toMatch(/over SSH/);
    expect(peerStatus(peer({ sshHost: "srv", tunnel: "up" })).text).toBe("Connecting…");
  });
});

describe("peerDownCopy", () => {
  it("offers turning it on for a machine turned off here", () => {
    const copy = peerDownCopy("Studio", peerStatus(peer({ enabled: false })));
    expect(copy.fix).toBe("turnOn");
    expect(copy.title).toMatch(/^Studio is turned off on /);
  });

  it("offers pairing again once the machine no longer accepts this one", () => {
    const copy = peerDownCopy("Studio", peerStatus(peer({ lastError: "401 Unauthorized" })));
    expect(copy.fix).toBe("pairAgain");
    expect(copy.detail).toMatch(/Pair again/);
  });

  it("offers a reconnect for anything a retry can fix", () => {
    expect(peerDownCopy("Studio", peerStatus(peer({ lastError: "Operation timed out (os error 60)" }))).fix).toBe(
      "reconnect",
    );
    expect(peerDownCopy("Studio", null)).toEqual({ title: "Studio disconnected", detail: "Reconnecting…", fix: "reconnect" });
  });
});
