import { describe, expect, it } from "vitest";
import {
  isMemoryPending,
  mergeMemoryRef,
  scanMemoryInvocation,
  soleChangedSession,
} from "./terminalMemory";

describe("scanMemoryInvocation", () => {
  it("reads the session out of either CLI's form", () => {
    expect(scanMemoryInvocation("/lpm-memory auth-refactor")).toEqual({
      session: "auth-refactor",
    });
    expect(scanMemoryInvocation("$lpm-memory auth-refactor")).toEqual({
      session: "auth-refactor",
    });
  });

  it("reports the bare form as unnamed", () => {
    expect(scanMemoryInvocation("/lpm-memory")).toEqual({ session: null });
    expect(scanMemoryInvocation("/lpm-memory   ")).toEqual({ session: null });
  });

  it("finds the invocation when the prompt continues underneath it", () => {
    const prompt = "/lpm-memory billing\n\nPick up where we left off on the webhook retries.";
    expect(scanMemoryInvocation(prompt)).toEqual({ session: "billing" });
  });

  it("finds an invocation on a later line", () => {
    expect(scanMemoryInvocation("First, read the plan.\n/lpm-memory ports\n")).toEqual({
      session: "ports",
    });
  });

  it("joins an array payload, which is one prompt in paste parts", () => {
    expect(scanMemoryInvocation(["/lpm-memory ", "billing", " and continue"])).toEqual({
      session: "billing",
    });
  });

  it("reads an invocation dropped mid-sentence, where the caret was", () => {
    expect(scanMemoryInvocation("keep going with /lpm-memory billing please")).toEqual({
      session: "billing",
    });
  });

  it("ignores text that only resembles the invocation", () => {
    expect(scanMemoryInvocation("what does lpm-memory do?")).toBeNull();
    expect(scanMemoryInvocation("/lpm-memoryx billing")).toBeNull();
    expect(scanMemoryInvocation("see ~/.claude/skills/lpm-memory/SKILL.md")).toBeNull();
    expect(scanMemoryInvocation("")).toBeNull();
  });

  it("ignores a neighbouring lpm command", () => {
    expect(scanMemoryInvocation("/lpm-config add a service")).toBeNull();
  });

  it("normalizes the session to the slug's own casing", () => {
    expect(scanMemoryInvocation("/LPM-MEMORY Auth-Refactor")).toEqual({
      session: "auth-refactor",
    });
  });
});

describe("mergeMemoryRef", () => {
  it("attaches the named session", () => {
    expect(mergeMemoryRef(undefined, "billing")).toEqual({ session: "billing" });
  });

  it("switches to a newly named session", () => {
    expect(mergeMemoryRef({ session: "billing" }, "ports")).toEqual({
      session: "ports",
    });
  });

  it("keeps the session a bare save is written into", () => {
    expect(mergeMemoryRef({ session: "billing" }, null)).toEqual({
      session: "billing",
    });
  });

  it("leaves a bare save unnamed in an unmarked terminal", () => {
    const ref = mergeMemoryRef(undefined, null);
    expect(ref).toEqual({});
    expect(isMemoryPending(ref)).toBe(true);
  });

  // Identity is the signal that nothing moved: the caller skips the tree update
  // — and the terminals.json write behind it — when the same ref comes back.
  it("returns the very same ref when the invocation says nothing new", () => {
    const named = { session: "billing" };
    expect(mergeMemoryRef(named, "billing")).toBe(named);
    expect(mergeMemoryRef(named, null)).toBe(named);

    const unnamed = {};
    expect(mergeMemoryRef(unnamed, null)).toBe(unnamed);
  });

  it("does not treat an unmarked terminal as pending", () => {
    expect(isMemoryPending(undefined)).toBe(false);
    expect(isMemoryPending({ session: "billing" })).toBe(false);
  });
});

describe("soleChangedSession", () => {
  const before = new Map([["billing", 100]]);

  it("names the one session that was created", () => {
    const after = new Map([
      ["billing", 100],
      ["auth-refactor", 300],
    ]);
    expect(soleChangedSession(before, after)).toBe("auth-refactor");
  });

  it("names a session the agent appended to rather than created", () => {
    expect(soleChangedSession(before, new Map([["billing", 400]]))).toBe("billing");
  });

  it("refuses when two sessions moved", () => {
    const after = new Map([
      ["billing", 400],
      ["auth-refactor", 300],
    ]);
    expect(soleChangedSession(before, after)).toBeNull();
  });

  it("refuses when nothing moved", () => {
    expect(soleChangedSession(before, before)).toBeNull();
  });

  it("ignores a deleted session", () => {
    expect(soleChangedSession(new Map([["billing", 100]]), new Map())).toBeNull();
  });
});
