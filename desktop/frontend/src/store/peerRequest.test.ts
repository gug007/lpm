import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/commands", () => ({
  PeerSend: vi.fn(() => Promise.resolve()),
}));

import { peerRequest, resolvePeerFrame } from "./peerRequest";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("peerRequest", () => {
  it("resolves with the matching reply frame", async () => {
    const p = peerRequest("peer-1", { t: "git", project: "web" }, (f) => f.t === "git" && f.project === "web");
    resolvePeerFrame("peer-1", { t: "git", project: "web", ok: true });
    await expect(p).resolves.toMatchObject({ t: "git", ok: true });
  });

  it("ignores non-matching frames, then times out", async () => {
    const p = peerRequest("peer-1", { t: "git", project: "web" }, (f) => f.t === "git", 1000);
    const assertion = expect(p).rejects.toThrow(/didn't respond/);
    resolvePeerFrame("peer-1", { t: "status", project: "web" }); // wrong type — ignored
    resolvePeerFrame("peer-2", { t: "git", project: "web" }); // wrong peer — ignored
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("routes interleaved replies to the right request by reqId", async () => {
    const p1 = peerRequest("peer-1", { t: "gitDiffs", reqId: "r1" }, (f) => f.reqId === "r1");
    const p2 = peerRequest("peer-1", { t: "gitDiffs", reqId: "r2" }, (f) => f.reqId === "r2");
    // Reply out of order.
    resolvePeerFrame("peer-1", { t: "gitDiffs", reqId: "r2", ok: true });
    resolvePeerFrame("peer-1", { t: "gitDiffs", reqId: "r1", ok: true });
    await expect(p1).resolves.toMatchObject({ reqId: "r1" });
    await expect(p2).resolves.toMatchObject({ reqId: "r2" });
  });

  it("resolves each matching request only once", async () => {
    const p = peerRequest("peer-1", { t: "git" }, (f) => f.t === "git");
    resolvePeerFrame("peer-1", { t: "git", n: 1 });
    resolvePeerFrame("peer-1", { t: "git", n: 2 }); // no pending entry left — no-op
    await expect(p).resolves.toMatchObject({ n: 1 });
  });
});
