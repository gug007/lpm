import { describe, expect, it } from "vitest";
import { prefixRoot } from "../../peer/markers";
import { canOpenSkillFile, canRevealSkillFile, skillFileReach } from "./skillFile";

describe("where a skill's file can be reached from", () => {
  const local = "/Users/me/.agents/skills/lesson/SKILL.md";
  const paired = prefixRoot("abcd1234", "/Users/them/web/.claude/skills/ship/SKILL.md");

  it("finds it on this computer", () => {
    expect(skillFileReach(local, "global", false)).toBe("here");
    expect(skillFileReach(local, "project", false)).toBe("here");
  });

  it("knows a paired computer's file by its marker", () => {
    expect(skillFileReach(paired, "project", false)).toBe("paired");
    expect(skillFileReach(paired, "global", false)).toBe("paired");
  });

  it("leaves an SSH project's skills on the host, and its global list here", () => {
    expect(skillFileReach("/home/me/app/.agents/skills/x/SKILL.md", "project", true)).toBe("ssh");
    expect(skillFileReach(local, "global", true)).toBe("here");
  });

  it("opens what the viewer can read, and reveals only this computer's", () => {
    expect((["here", "paired", "ssh"] as const).filter(canOpenSkillFile)).toEqual(["here", "paired"]);
    expect((["here", "paired", "ssh"] as const).filter(canRevealSkillFile)).toEqual(["here"]);
  });
});
