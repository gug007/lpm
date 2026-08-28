import { describe, expect, it } from "vitest";
import type { SkillDestination } from "./toolkitSkill";
import {
  draftLine,
  lineTokens,
  matchTokens,
  parseLine,
  tokenFor,
} from "./toolkitSkillLine";

function dest(over: Partial<SkillDestination> = {}): SkillDestination {
  return {
    path: "/h/.claude/skills",
    cli: "claude",
    scope: "user",
    label: "Claude Code",
    exists: true,
    ...over,
  };
}

const DESTS = [
  dest(),
  dest({ path: "/p/.claude/skills", scope: "project", label: "Claude Code, in this project" }),
  dest({
    path: "/h/.agents/skills",
    cli: "codex",
    scope: "user",
    label: "Codex, Gemini and OpenCode",
    exists: false,
  }),
];

function tokens(manual = false, manualAllowed = true) {
  return lineTokens({ destinations: DESTS, manual, manualAllowed, slash: "/deploy-web" });
}

describe("parseLine", () => {
  it("reads a bare name", () => {
    expect(parseLine("deploy-web")).toEqual({ name: "deploy-web", trigger: null, query: "" });
  });

  it("splits a trailing fragment off the name", () => {
    expect(parseLine("deploy-web @cla")).toEqual({
      name: "deploy-web",
      trigger: "@",
      query: "cla",
    });
    expect(parseLine("deploy-web /man")).toEqual({
      name: "deploy-web",
      trigger: "/",
      query: "man",
    });
  });

  it("treats a bare trigger as an empty query", () => {
    expect(parseLine("@")).toEqual({ name: "", trigger: "@", query: "" });
  });

  it("drops the separator that ran into the trigger", () => {
    expect(parseLine("deploy-web-@").name).toBe("deploy-web");
  });

  it("keeps a hyphen the user is still typing", () => {
    expect(parseLine("deploy-").name).toBe("deploy-");
  });
});

describe("draftLine", () => {
  it("slugifies what is typed, as the name field did", () => {
    expect(draftLine("Deploy Web")).toBe("deploy-web");
    expect(draftLine("deploy web ")).toBe("deploy-web-");
  });

  it("keeps a fragment intact behind one space", () => {
    expect(draftLine("deploy-web @Cl")).toBe("deploy-web @cl");
    expect(draftLine("deploy web /MANUAL")).toBe("deploy-web /manual");
  });

  it("is idempotent, so re-typing never shifts the value", () => {
    const once = draftLine("Deploy Web @Cl");
    expect(draftLine(once)).toBe(once);
  });

  it("allows a line that is only a token", () => {
    expect(draftLine("@agents")).toBe("@agents");
  });
});

describe("lineTokens", () => {
  it("names each folder by the agent that reads it", () => {
    expect(tokens().map((t) => t.token)).toEqual(["@claude", "@project", "@agents", "/manual"]);
  });

  it("says when a folder does not exist yet", () => {
    expect(tokens().find((t) => t.token === "@agents")?.hint).toContain("will be created");
  });

  it("offers the way back once the skill is manual", () => {
    expect(tokens(true).map((t) => t.token)).toContain("/auto");
    expect(tokens(true).map((t) => t.token)).not.toContain("/manual");
  });

  it("greys out manual where the key would be ignored", () => {
    const mode = tokens(false, false).find((t) => t.kind === "mode");
    expect(mode?.disabled).toBe(true);
    expect(mode?.hint).toContain("Only Claude Code");
  });

  it("keeps tokens unique when two folders would claim one", () => {
    const twins = [dest({ path: "/a/.agents/skills", cli: "codex" }), dest({ path: "/b/.agents/skills", cli: "codex" })];
    const made = lineTokens({ destinations: twins, manual: false, manualAllowed: true, slash: "/x" });
    expect(made.map((t) => t.token)).toEqual(["@agents", "@agents-2", "/manual"]);
  });
});

describe("matchTokens", () => {
  it("keeps each trigger to its own vocabulary", () => {
    expect(matchTokens(tokens(), "@", "").every((t) => t.kind === "dest")).toBe(true);
    expect(matchTokens(tokens(), "/", "").map((t) => t.token)).toEqual(["/manual"]);
  });

  it("matches the token first and the label second", () => {
    expect(matchTokens(tokens(), "@", "pro").map((t) => t.token)).toEqual(["@project"]);
    expect(matchTokens(tokens(), "@", "codex").map((t) => t.token)).toEqual(["@agents"]);
  });

  it("offers everything when nothing is being typed", () => {
    expect(matchTokens(tokens(), null, "")).toHaveLength(4);
  });
});

describe("tokenFor", () => {
  it("finds the chip for the chosen folder", () => {
    expect(tokenFor(tokens(), "/p/.claude/skills")?.token).toBe("@project");
    expect(tokenFor(tokens(), "/nowhere")).toBeNull();
  });
});
