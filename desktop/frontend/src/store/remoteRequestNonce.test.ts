import { describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/commands", () => new Proxy({}, { get: () => vi.fn() }));
vi.mock("../../bridge/runtime", () => new Proxy({}, { get: () => vi.fn() }));

import { useAppStore } from "./app";

// The phone-relay consumer latches the last-consumed nonce in a ref that lives
// as long as the mounted ProjectDetail, and clears the pending slot after each
// consume. Nonces must therefore be unique across trigger→clear cycles — a
// nonce derived from the (just-cleared) slot restarts at 1 and every request
// after the first is silently dropped.
describe("remote request nonces", () => {
  it("stay unique across trigger/clear cycles", () => {
    const seen: number[] = [];
    const s = useAppStore.getState();

    s.triggerRemoteAction("proj", null);
    seen.push(useAppStore.getState().pendingRemoteAction!.nonce);
    s.clearPendingRemoteAction();

    s.triggerRemoteAction("proj", null);
    seen.push(useAppStore.getState().pendingRemoteAction!.nonce);
    s.clearPendingRemoteAction();

    s.triggerRemoteTerminalOp("proj", "close", "t1", "", []);
    seen.push(useAppStore.getState().pendingRemoteTerminalOp!.nonce);
    s.clearPendingRemoteTerminalOp();

    s.triggerRemoteTerminalOp("proj", "close", "t2", "", []);
    seen.push(useAppStore.getState().pendingRemoteTerminalOp!.nonce);

    expect(new Set(seen).size).toBe(seen.length);
  });
});
