import { describe, expect, it } from "vitest";
import {
  SENT_SETTLE_MS,
  SETTLED_QUIET_MS,
  STALE_WORKING_MS,
  foregroundKind,
  readiness,
  type ReadinessInput,
} from "./readiness";

const NOW = 1_000_000;
const base: ReadinessInput = {
  now: NOW,
  force: false,
  forAgent: true,
  foreground: "program",
  agent: undefined,
  quietMs: 60_000,
  switchingModel: false,
  lastSentAt: null,
};

describe("readiness", () => {
  it("sends when the agent is up and done, errored or silent", () => {
    expect(readiness({ ...base, agent: "done" }).ready).toBe(true);
    expect(readiness({ ...base, agent: "error" }).ready).toBe(true);
    expect(readiness(base).ready).toBe(true);
    expect(readiness({ ...base, foreground: "unknown" }).ready).toBe(true);
  });

  it("never types an agent's prompt into a bare shell, not even for Send now", () => {
    expect(readiness({ ...base, foreground: "shell" })).toMatchObject({ ready: false, hold: "starting" });
    expect(readiness({ ...base, foreground: "shell", force: true })).toMatchObject({ ready: false, hold: "starting" });
  });

  it("waits for a starting agent to settle before typing", () => {
    const held = readiness({ ...base, quietMs: 500, force: true });
    expect(held).toEqual({ ready: false, hold: "starting", retryAt: NOW + SETTLED_QUIET_MS - 500 });
  });

  it("waits while the agent works or asks a question", () => {
    expect(readiness({ ...base, agent: "working", quietMs: 1000 })).toMatchObject({ ready: false, hold: "busy" });
    expect(readiness({ ...base, agent: "needs-you" })).toEqual({ ready: false, hold: "asking", retryAt: null });
  });

  it("never answers a question for you, even with Send now", () => {
    expect(readiness({ ...base, agent: "needs-you", force: true })).toMatchObject({ ready: false, hold: "asking" });
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

  it("lets Send now skip the wait for a working agent, but never into a model picker", () => {
    expect(readiness({ ...base, force: true, agent: "working", quietMs: 0 }).ready).toBe(true);
    expect(readiness({ ...base, force: true, switchingModel: true }).ready).toBe(false);
  });

  it("types a shell command only at the shell's prompt, unless sent now", () => {
    const shell = { ...base, forAgent: false };
    expect(readiness({ ...shell, foreground: "shell", quietMs: 0 }).ready).toBe(true);
    expect(readiness({ ...shell, foreground: "program" })).toMatchObject({ ready: false, hold: "busy" });
    expect(readiness({ ...shell, foreground: "program", force: true }).ready).toBe(true);
  });
});

describe("foregroundKind", () => {
  it("tells a shell at its prompt from a program", () => {
    expect(foregroundKind("zsh")).toBe("shell");
    expect(foregroundKind("-zsh")).toBe("shell");
    expect(foregroundKind("claude")).toBe("program");
    expect(foregroundKind("node")).toBe("program");
    expect(foregroundKind("")).toBe("unknown");
    expect(foregroundKind(null)).toBe("unknown");
  });
});
