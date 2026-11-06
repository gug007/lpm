import { describe, it, expect } from "vitest";
import {
  buildForkLaunch,
  canForkSession,
  claudeSessionIdOf,
  forkedSessionOf,
} from "./forkSession";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

describe("canForkSession", () => {
  it("accepts claude resume commands", () => {
    expect(canForkSession("claude --resume abc123")).toBe(true);
    expect(canForkSession("FOO=bar claude --resume abc123 --model opus")).toBe(
      true,
    );
    expect(canForkSession("/usr/local/bin/claude --resume abc123")).toBe(true);
  });

  it("accepts codex resume commands", () => {
    expect(canForkSession("codex resume s1")).toBe(true);
    expect(canForkSession("FOO=bar /opt/bin/codex resume s1")).toBe(true);
  });

  it("rejects empty, unknown, and malformed commands", () => {
    expect(canForkSession(undefined)).toBe(false);
    expect(canForkSession("")).toBe(false);
    expect(canForkSession("aider --resume abc")).toBe(false);
    expect(canForkSession("claude")).toBe(false);
    expect(canForkSession("claude --resume")).toBe(false);
    expect(canForkSession("codex --resume s1")).toBe(false);
    expect(canForkSession("codex resume")).toBe(false);
  });
});

describe("claudeSessionIdOf", () => {
  it("extracts the resumed claude session id", () => {
    expect(claudeSessionIdOf("FOO=bar claude --resume abc-123 --model opus")).toBe(
      "abc-123",
    );
  });

  it("returns null for codex and unforkable commands", () => {
    expect(claudeSessionIdOf("codex resume s1")).toBeNull();
    expect(claudeSessionIdOf("bash")).toBeNull();
    expect(claudeSessionIdOf(undefined)).toBeNull();
  });
});

describe("buildForkLaunch", () => {
  it("forks claude with a pre-minted session id", () => {
    const launch = buildForkLaunch("claude --resume old-id --model opus");
    expect(launch).not.toBeNull();
    expect(launch!.cmd).toMatch(
      new RegExp(
        `^claude --resume old-id --model opus --fork-session --session-id ${UUID.source}$`,
      ),
    );
    const newId = launch!.cmd.match(UUID)![0];
    expect(launch!.resumeCmd).toBe(`claude --resume ${newId} --model opus`);
  });

  it("starts a claude fork over as the same fork, never as the session it branched from", () => {
    const launch = buildForkLaunch("claude --resume old-id")!;
    expect(launch.startCmd).toBe(launch.cmd);
    expect(launch.startCmd).not.toContain("--session-id old-id");
  });

  it("gives every fork of one session its own id", () => {
    const ids = [1, 2, 3].map(() => buildForkLaunch("claude --resume old-id")!.cmd.match(UUID)![0]);
    expect(new Set(ids).size).toBe(3);
  });

  it("preserves env assignments in claude forks", () => {
    const launch = buildForkLaunch("FOO=bar claude --resume old-id");
    expect(launch!.cmd.startsWith("FOO=bar claude --resume old-id")).toBe(true);
    expect(launch!.resumeCmd!.startsWith("FOO=bar claude --resume ")).toBe(
      true,
    );
  });

  it("leaves a codex fork's start command to its tab", () => {
    expect(buildForkLaunch("codex resume s1")!.startCmd).toBeUndefined();
  });

  it("turns codex resume into codex fork without a resumeCmd", () => {
    expect(buildForkLaunch("FOO=bar codex resume s1")).toEqual({
      cmd: "FOO=bar codex fork s1",
    });
    expect(buildForkLaunch("/opt/bin/codex resume s1")).toEqual({
      cmd: "/opt/bin/codex fork s1",
    });
  });

  it("returns null for unforkable commands", () => {
    expect(buildForkLaunch("bash")).toBeNull();
    expect(buildForkLaunch("claude --resume")).toBeNull();
  });
});

describe("forkedSessionOf", () => {
  it("names the session a claude fork launch branches from", () => {
    expect(forkedSessionOf("claude --resume src --permission-mode auto --fork-session --session-id f1")).toBe("src");
    expect(forkedSessionOf("FOO=bar claude --resume src --fork-session --session-id f1")).toBe("src");
  });

  it("returns null for launches that aren't forks", () => {
    expect(forkedSessionOf("claude --session-id src --permission-mode auto")).toBeNull();
    expect(forkedSessionOf("claude --resume src")).toBeNull();
    expect(forkedSessionOf("codex fork s1")).toBeNull();
    expect(forkedSessionOf(undefined)).toBeNull();
  });
});
