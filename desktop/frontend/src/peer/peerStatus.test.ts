import { describe, expect, it } from "vitest";
import { humanizeError, peerStatus } from "./peerStatus";
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
