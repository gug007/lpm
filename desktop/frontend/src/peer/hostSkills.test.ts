import { describe, expect, it } from "vitest";
import {
  hostSkillDone,
  hostSkillError,
  hostSkillLabel,
  hostSkillNote,
  parseHostSkillState,
} from "./hostSkills";

describe("parseHostSkillState", () => {
  it("takes the host's own three answers", () => {
    expect(parseHostSkillState({ status: "installed" })).toBe("installed");
    expect(parseHostSkillState({ status: "outdated" })).toBe("outdated");
    expect(parseHostSkillState({ status: "not-installed" })).toBe("not-installed");
  });

  it("is unknown for anything it does not recognise", () => {
    expect(parseHostSkillState(null)).toBe("unknown");
    expect(parseHostSkillState({})).toBe("unknown");
    expect(parseHostSkillState({ status: "partial" })).toBe("unknown");
    expect(parseHostSkillState("installed")).toBe("unknown");
  });
});

describe("hostSkillLabel", () => {
  it("names what the click will actually do", () => {
    expect(hostSkillLabel("not-installed")).toBe("Install skills there");
    expect(hostSkillLabel("outdated")).toBe("Update skills there");
    expect(hostSkillLabel("installed")).toBe("Reinstall skills there");
  });

  it("offers the repair even when the state is unknown", () => {
    expect(hostSkillLabel("unknown")).toBe("Reinstall skills there");
  });
});

describe("hostSkillNote", () => {
  it("says nothing about a host that is fine", () => {
    expect(hostSkillNote("installed")).toBe("");
    expect(hostSkillNote("unknown")).toBe("");
  });

  it("flags the two states worth acting on", () => {
    expect(hostSkillNote("outdated")).toBe(" · skills out of date");
    expect(hostSkillNote("not-installed")).toBe(" · skills not installed");
  });
});

describe("hostSkillDone", () => {
  it("confirms the install and says why nothing changed yet", () => {
    const done = hostSkillDone("installed");
    expect(done).toContain("Skills installed");
    expect(done).toContain("restart agents");
  });

  it("does not claim success the host itself is not reporting", () => {
    for (const state of ["outdated", "not-installed", "unknown"] as const) {
      expect(hostSkillDone(state)).toContain("out of date");
    }
  });

  it("keeps the how out of it", () => {
    expect(hostSkillDone("installed")).not.toMatch(/\.claude|SKILL\.md|ssh/i);
  });
});

describe("hostSkillError", () => {
  it("turns the host's refusal into the action that fixes it", () => {
    const raw = "command not permitted over peer connection: install_agent_skill";
    expect(hostSkillError(raw)).toContain("too old");
    expect(hostSkillError(raw)).toContain("Update lpm there");
  });

  it("passes anything else through untouched", () => {
    expect(hostSkillError("cannot write /root/.claude/skills: No space left")).toBe(
      "cannot write /root/.claude/skills: No space left",
    );
  });
});
