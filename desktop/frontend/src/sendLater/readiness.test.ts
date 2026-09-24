import { describe, expect, it } from "vitest";
import { SENT_SETTLE_MS, STALE_WORKING_MS, readiness, type ReadinessInput } from "./readiness";

const NOW = 1_000_000;
const base: ReadinessInput = {
  now: NOW,
  force: false,
  agent: undefined,
  quietMs: 0,
  switchingModel: false,
  lastSentAt: null,
};

describe("readiness", () => {
  it("sends when the agent is done, errored or silent", () => {
    expect(readiness({ ...base, agent: "done" }).ready).toBe(true);
    expect(readiness({ ...base, agent: "error" }).ready).toBe(true);
    expect(readiness(base).ready).toBe(true);
  });

  it("waits while the agent works or asks a question", () => {
    expect(readiness({ ...base, agent: "working", quietMs: 1000 })).toMatchObject({ ready: false, hold: "busy" });
    expect(readiness({ ...base, agent: "needs-you" })).toEqual({ ready: false, hold: "asking", retryAt: null });
  });

  it("stops waiting on an agent that says it's working but has gone quiet", () => {
    expect(readiness({ ...base, agent: "working", quietMs: STALE_WORKING_MS }).ready).toBe(true);
    const held = readiness({ ...base, agent: "working", quietMs: STALE_WORKING_MS - 5000 });
    expect(held).toEqual({ ready: false, hold: "busy", retryAt: NOW + 5000 });
  });

  it("leaves a terminal alone right after it took a prompt", () => {
    const held = readiness({ ...base, agent: "done", lastSentAt: NOW - 1000 });
    expect(held).toEqual({ ready: false, hold: "busy", retryAt: NOW - 1000 + SENT_SETTLE_MS });
    expect(readiness({ ...base, lastSentAt: NOW - SENT_SETTLE_MS }).ready).toBe(true);
  });

  it("lets Send now skip the wait, but never into a model picker", () => {
    expect(readiness({ ...base, force: true, agent: "working", quietMs: 0 }).ready).toBe(true);
    expect(readiness({ ...base, force: true, agent: "needs-you" }).ready).toBe(true);
    expect(readiness({ ...base, force: true, switchingModel: true }).ready).toBe(false);
  });
});
