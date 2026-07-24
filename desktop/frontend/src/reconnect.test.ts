import { describe, it, expect } from "vitest";
import {
  reconnectDelayMs,
  shouldReconnect,
  SSH_TRANSPORT_EXIT_CODE,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  RECONNECT_PROBE_OUTPUT_GRACE_MS,
  RECONNECT_PROBE_WINDOW_MS,
  type ReconnectDecision,
} from "./reconnect";

describe("reconnectDelayMs", () => {
  it("doubles from the base delay per attempt", () => {
    expect(reconnectDelayMs(1)).toBe(2000);
    expect(reconnectDelayMs(2)).toBe(4000);
    expect(reconnectDelayMs(3)).toBe(8000);
    expect(reconnectDelayMs(4)).toBe(16000);
  });

  it("caps at the max delay", () => {
    expect(reconnectDelayMs(5)).toBe(RECONNECT_MAX_MS);
    expect(reconnectDelayMs(6)).toBe(RECONNECT_MAX_MS);
    expect(reconnectDelayMs(100)).toBe(RECONNECT_MAX_MS);
  });

  it("falls back to the base delay for non-positive attempts", () => {
    expect(reconnectDelayMs(0)).toBe(RECONNECT_BASE_MS);
    expect(reconnectDelayMs(-3)).toBe(RECONNECT_BASE_MS);
  });

  it("honors custom base/max overrides", () => {
    expect(reconnectDelayMs(1, 500, 5000)).toBe(500);
    expect(reconnectDelayMs(2, 500, 5000)).toBe(1000);
    expect(reconnectDelayMs(20, 500, 5000)).toBe(5000);
  });
});

describe("probe window", () => {
  it("covers the ConnectTimeout=10 baked into ssh_args", () => {
    expect(RECONNECT_PROBE_WINDOW_MS).toBeGreaterThan(10_000);
  });

  it("keeps the output grace well under the window", () => {
    expect(RECONNECT_PROBE_OUTPUT_GRACE_MS).toBeLessThan(
      RECONNECT_PROBE_WINDOW_MS / 2,
    );
  });
});

describe("shouldReconnect", () => {
  const base: ReconnectDecision = {
    exitCode: SSH_TRANSPORT_EXIT_CODE,
    isRemote: true,
    stillInTree: true,
    pendingClose: false,
  };

  it("reconnects a live remote terminal that dropped its transport", () => {
    expect(shouldReconnect(base)).toBe(true);
  });

  it("does not reconnect on a clean remote exit code", () => {
    expect(shouldReconnect({ ...base, exitCode: 0 })).toBe(false);
    expect(shouldReconnect({ ...base, exitCode: 130 })).toBe(false);
  });

  it("does not reconnect local terminals", () => {
    expect(shouldReconnect({ ...base, isRemote: false })).toBe(false);
  });

  it("does not reconnect a tab the user already closed", () => {
    expect(shouldReconnect({ ...base, stillInTree: false })).toBe(false);
  });

  it("does not reconnect a tab whose close is pending an undo", () => {
    expect(shouldReconnect({ ...base, pendingClose: true })).toBe(false);
  });
});
