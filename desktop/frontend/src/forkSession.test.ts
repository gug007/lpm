import { describe, it, expect } from "vitest";
import { buildForkLaunch, canForkSession } from "./forkSession";

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

  it("preserves env assignments in claude forks", () => {
    const launch = buildForkLaunch("FOO=bar claude --resume old-id");
    expect(launch!.cmd.startsWith("FOO=bar claude --resume old-id")).toBe(true);
    expect(launch!.resumeCmd!.startsWith("FOO=bar claude --resume ")).toBe(
      true,
    );
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
