import { describe, expect, it } from "vitest";
import type { AgentCapability, CapabilityRoot } from "./toolkit";
import { splitFrontmatter } from "./toolkit";
import type { SkillDestination } from "./toolkitSkill";
import {
  defaultDestination,
  joinSkillBody,
  skillClash,
  skillDescription,
  skillDescriptionError,
  skillDestinations,
  skillFilePath,
  skillName,
  skillNameDraft,
  skillNameError,
  skillSiblings,
  skillTemplate,
  splitSkillBody,
} from "./toolkitSkill";

const CLAUDE_USER = "/Users/ada/.claude/skills";
const CLAUDE_PROJECT = "/repo/app/.claude/skills";
const CODEX_HOME = "/Users/ada/.codex/skills";
const CODEX_SHARED = "/Users/ada/.agents/skills";

function root(over: Partial<CapabilityRoot> = {}): CapabilityRoot {
  return { cli: "claude", scope: "user", kind: "skill", path: CLAUDE_USER, exists: true, ...over };
}

// The four roots this machine offers, in the order the scan reports them.
const ROOTS: CapabilityRoot[] = [
  root(),
  root({ scope: "project", path: CLAUDE_PROJECT }),
  root({ cli: "codex", path: CODEX_HOME }),
  root({ cli: "codex", path: CODEX_SHARED, exists: false }),
];

function cap(over: Partial<AgentCapability> = {}): AgentCapability {
  return {
    id: "claude:skill:user:deploy",
    kind: "skill",
    name: "deploy",
    cli: "claude",
    scope: "user",
    path: `${CLAUDE_USER}/deploy/SKILL.md`,
    description: "Ship it",
    detail: "",
    enabled: true,
    editable: true,
    shadowedBy: "",
    problem: "",
    blocking: false,
    bytes: 0,
    ...over,
  };
}

function dest(path: string): SkillDestination {
  const found = skillDestinations(ROOTS).find((d) => d.path === path);
  if (!found) throw new Error(`no destination for ${path}`);
  return found;
}

describe("skillNameDraft and skillName", () => {
  // Trimming the hyphen while the user is still typing makes the field collapse
  // under their fingers halfway through "deploy-web".
  it("keeps a trailing hyphen in the field and drops it on submit", () => {
    expect(skillNameDraft("Deploy Web")).toBe("deploy-web");
    expect(skillNameDraft("code-")).toBe("code-");
    expect(skillName("code-")).toBe("code");
  });

  // The reason `slugify` is not reused: it keeps both of these characters.
  it("collapses dots and underscores, which slugify would have kept", () => {
    expect(skillNameDraft("my.skill")).toBe("my-skill");
    expect(skillNameDraft("my_skill")).toBe("my-skill");
  });

  it("never produces a hidden folder or a double hyphen", () => {
    expect(skillNameDraft(".system")).toBe("system");
    expect(skillNameDraft("a -- b")).toBe("a-b");
  });

  it("caps both at 64 characters", () => {
    expect(skillNameDraft("a".repeat(70))).toHaveLength(64);
    expect(skillName("a".repeat(70))).toHaveLength(64);
  });
});

// The same accept/reject corpus the Rust validator is tested against. They must
// agree, or the user gets a green field and a refusal from the backend.
describe("skillNameError", () => {
  it("accepts a kebab-case name", () => {
    expect(skillNameError("deploy")).toBeNull();
    expect(skillNameError("lpm-cli")).toBeNull();
    expect(skillNameError("x2")).toBeNull();
  });

  it("rejects everything that would not be one folder under a root", () => {
    for (const bad of ["", ".", "..", ".system", "a/b", "a b", "Deploy", "-x", "x-", "a--b"]) {
      expect(skillNameError(bad), bad).not.toBeNull();
    }
    expect(skillNameError("a".repeat(65))).not.toBeNull();
  });
});

describe("skillDescriptionError", () => {
  it("insists on something to match against", () => {
    expect(skillDescriptionError("")).not.toBeNull();
    expect(skillDescriptionError("   ")).not.toBeNull();
  });

  // Both CLIs drop a skill whose description holds an angle bracket, and say so
  // only as a count of files they skipped.
  it("rejects the angle brackets that make a skill silently not load", () => {
    expect(skillDescriptionError("Use when <path> is given.")).toBe(
      "Skip the < and > characters here.",
    );
    expect(skillDescriptionError("Use when a > b.")).not.toBeNull();
  });

  it("accepts exactly 1024 characters and refuses more", () => {
    expect(skillDescriptionError("x".repeat(1024))).toBeNull();
    expect(skillDescriptionError("x".repeat(1025))).not.toBeNull();
  });
});

// The file has to load in both CLIs on the first try: a key either vendor's
// validator rejects turns the new skill into a silent no-op.
describe("skillTemplate", () => {
  const template = skillTemplate(
    "deploy-web",
    "Ship the site. Use when asked to deploy.",
    false,
    "1. Build the site",
  );

  it("carries exactly name and description, and no version", () => {
    const { fields } = splitFrontmatter(template);
    expect(fields.map((f) => f.key)).toEqual(["name", "description"]);
    expect(template).not.toContain("version:");
  });

  it("names the frontmatter after the folder it will sit in", () => {
    const { fields } = splitFrontmatter(skillTemplate("lpm-cli", "Runs lpm.", false, "Run it."));
    expect(fields[0].value).toBe("lpm-cli");
  });

  it("leaves no TODO placeholder line, which one validator rejects outright", () => {
    for (const line of template.split("\n")) {
      expect(/^ {0,3}\[TODO:/.test(line)).toBe(false);
    }
  });

  it("titles the body after the name", () => {
    expect(template).toContain("# Deploy Web");
  });

  it("escapes a quoted description rather than breaking the frontmatter", () => {
    const quoted = skillTemplate("deploy", 'Ship the "web" app.', false, "Run it.");
    expect(quoted).toContain('description: "Ship the \\"web\\" app."');
    expect(splitFrontmatter(quoted).fields.map((f) => f.key)).toEqual(["name", "description"]);
  });

  it("folds a description that spans lines", () => {
    const folded = skillTemplate("deploy", "Ship it.\nUse when asked to deploy.", false, "Run it.");
    expect(folded).toContain("description: >-\n  Ship it.\n  Use when asked to deploy.");
    expect(splitFrontmatter(folded).fields.map((f) => f.key)).toEqual(["name", "description"]);
  });

  // The one key beyond name and description lpm will write, and only on request:
  // the skill leaves the model's context and runs only as a user-typed /name.
  it("adds the opt-out key only for a manual-only skill", () => {
    const manual = skillTemplate("deploy", "Ship it.", true, "Run it.");
    expect(splitFrontmatter(manual).fields).toContainEqual({
      key: "disable-model-invocation",
      value: "true",
    });
    expect(template).not.toContain("disable-model-invocation");
  });

  // The instructions are the file: the form requires them, so the template has
  // no placeholder prose left to ship into a skill nobody finished.
  it("writes the instructions as the body, under the title", () => {
    const written = skillTemplate("deploy", "Ship it.", false, "1. Build\n2. Ship");
    expect(splitFrontmatter(written).body).toBe("\n# Deploy\n\n1. Build\n2. Ship\n");
  });
});

describe("skillDescription", () => {
  // The form has to reopen what the template wrote, whichever shape it took.
  it("reads back what skillTemplate wrote", () => {
    for (const written of ["Ship it.", 'Ship the "web" app.', "Ship it.\nUse when asked."]) {
      expect(skillDescription(skillTemplate("deploy", written, false, "Run it."))).toBe(written);
    }
  });

  it("unfolds a hand-written block, and drops the blank lines under it", () => {
    const doc = "---\nname: deploy\ndescription: |\n  Ship it.\n\n  Use when asked.\n\nmodel: sonnet\n---\n\nBody.";
    expect(skillDescription(doc)).toBe("Ship it.\n\nUse when asked.");
  });

  it("has nothing to say about a file with no description of its own", () => {
    expect(skillDescription("# Deploy\n\nRun it.")).toBe("");
    expect(skillDescription("---\nname: deploy\n---\n\nBody.")).toBe("");
  });

  it("takes a single-quoted value as written", () => {
    expect(skillDescription("---\ndescription: 'Ship it'\n---\n\nBody.")).toBe("Ship it");
    expect(skillDescription("---\ndescription: Ship it\n---\n\nBody.")).toBe("Ship it");
  });
});

describe("skillDestinations", () => {
  it("keeps only the skill roots, in scan order, and names the shared folder", () => {
    expect(skillDestinations(ROOTS).map((d) => d.label)).toEqual([
      "Claude Code",
      "Claude Code, in this project",
      "Codex",
      "Codex, Gemini and OpenCode",
    ]);
  });

  it("carries whether the folder is there yet", () => {
    expect(skillDestinations(ROOTS).map((d) => d.exists)).toEqual([true, true, true, false]);
  });

  // Over SSH the remote scan registers no skill root at all, so there is nowhere
  // to offer and the pane never shows the button.
  it("has nothing to offer for a remote payload", () => {
    const remote = [root({ kind: "mcp", path: "/Users/ada/.claude.json" })];
    expect(skillDestinations(remote)).toEqual([]);
  });
});

describe("defaultDestination", () => {
  const dests = skillDestinations(ROOTS);

  it("follows the CLI pill", () => {
    expect(defaultDestination(dests, "all")).toBe(CLAUDE_USER);
    expect(defaultDestination(dests, "claude")).toBe(CLAUDE_USER);
    // The folder Gemini and OpenCode read too is the more useful Codex default.
    expect(defaultDestination(dests, "codex")).toBe(CODEX_SHARED);
  });

  it("falls back to the first folder offered, and to nothing at all", () => {
    expect(defaultDestination([dests[2]], "claude")).toBe(CODEX_HOME);
    expect(defaultDestination([], "all")).toBe("");
  });
});

describe("skillClash", () => {
  const taken = cap({ name: "deploy-web", path: `${CLAUDE_USER}/deploy-web/SKILL.md` });

  it("blocks a name the chosen folder already holds, and points at it", () => {
    const clash = skillClash("deploy-web", dest(CLAUDE_USER), [taken], false);
    expect(clash).toEqual({
      tone: "bad",
      text: "A skill called deploy-web is already in ~/.claude/skills.",
      existingPath: taken.path,
    });
  });

  it("does not block the same name in a different folder", () => {
    const clash = skillClash("deploy-web", dest(CLAUDE_PROJECT), [taken], false);
    expect(clash?.tone).toBe("warn");
  });

  // Skills resolve the opposite way to subagents and commands: the personal copy
  // wins, so which warning appears depends on which side is being written.
  it("points the shadow the right way in each direction", () => {
    const inProject = cap({
      name: "deploy-web",
      scope: "project",
      path: `${CLAUDE_PROJECT}/deploy-web/SKILL.md`,
    });
    expect(skillClash("deploy-web", dest(CLAUDE_USER), [inProject], false)).toEqual({
      tone: "warn",
      text: "Claude Code will use this one instead of the copy in this project.",
    });
    expect(skillClash("deploy-web", dest(CLAUDE_PROJECT), [taken], false)).toEqual({
      tone: "warn",
      text: "You already have a personal copy of this name, and Claude Code uses that one. This copy will not load.",
    });
  });

  it("calls Codex's two folders undefined rather than picking a winner", () => {
    const shared = cap({
      name: "deploy-web",
      cli: "codex",
      path: `${CODEX_SHARED}/deploy-web/SKILL.md`,
    });
    expect(skillClash("deploy-web", dest(CODEX_HOME), [shared], false)).toEqual({
      tone: "warn",
      text: "Codex already has a skill with this name. Which one it uses is not defined.",
    });
  });

  it("says nothing about a plugin copy or a copy under the other CLI", () => {
    const plugin = cap({
      name: "deploy-web",
      scope: "plugin",
      path: "/Users/ada/.claude/plugins/repos/o/r/skills/deploy-web/SKILL.md",
    });
    const other = cap({
      name: "deploy-web",
      cli: "codex",
      path: `${CODEX_HOME}/deploy-web/SKILL.md`,
    });
    expect(skillClash("deploy-web", dest(CLAUDE_USER), [plugin, other], false)).toBeNull();
  });

  // An incomplete listing cannot be read as "no conflict".
  it("claims nothing when the listing ran out of room", () => {
    expect(skillClash("deploy-web", dest(CLAUDE_USER), [taken], true)).toBeNull();
  });

  it("stays quiet until there is a name and a folder", () => {
    expect(skillClash("", dest(CLAUDE_USER), [taken], false)).toBeNull();
    expect(skillClash("deploy-web", null, [taken], false)).toBeNull();
  });
});

describe("skillSiblings", () => {
  it("finds the same name somewhere else, across CLIs", () => {
    const mine = cap({ name: "lpm-cli", path: `${CLAUDE_USER}/lpm-cli/SKILL.md` });
    const twin = cap({
      name: "lpm-cli",
      cli: "codex",
      path: `${CODEX_SHARED}/lpm-cli/SKILL.md`,
    });
    expect(skillSiblings(mine, [mine, twin])).toEqual([twin]);
  });

  it("leaves out itself, other kinds and plugin copies", () => {
    const mine = cap({ name: "lpm-cli", path: `${CLAUDE_USER}/lpm-cli/SKILL.md` });
    const others = [
      mine,
      cap({ kind: "subagent", name: "lpm-cli", path: "/repo/app/.claude/agents/lpm-cli.md" }),
      cap({
        name: "lpm-cli",
        scope: "plugin",
        path: "/Users/ada/.claude/plugins/repos/o/r/skills/lpm-cli/SKILL.md",
      }),
    ];
    expect(skillSiblings(mine, others)).toEqual([]);
  });
});

describe("skillFilePath", () => {
  it("is one folder under the root, holding one SKILL.md", () => {
    expect(skillFilePath(CLAUDE_USER, "deploy-web")).toBe(
      "/Users/ada/.claude/skills/deploy-web/SKILL.md",
    );
    expect(skillFilePath(`${CLAUDE_USER}/`, "deploy-web")).toBe(
      "/Users/ada/.claude/skills/deploy-web/SKILL.md",
    );
  });
});

describe("splitSkillBody and joinSkillBody", () => {
  // What the create form wrote: the heading comes from the name, so it is not
  // instructions and not something to hand back for retyping.
  it("lifts out the heading and hands back the prose", () => {
    const file = skillTemplate("deploy-web", "Ship it", false, "1. Build\n2. Ship");
    expect(splitSkillBody(file)).toEqual({
      heading: "# Deploy Web",
      instructions: "1. Build\n2. Ship",
    });
  });

  it("puts back exactly what it took", () => {
    const file = skillTemplate("deploy-web", "Ship it", true, "1. Build");
    const { heading, instructions } = splitSkillBody(file);
    expect(splitFrontmatter(file).body.trim()).toBe(joinSkillBody(heading, instructions));
  });

  // A hand-written file may open with prose, a section heading, or nothing at
  // all. Only a top-level heading on the first line is the name's.
  it("leaves every other opening where it is", () => {
    expect(splitSkillBody("---\nname: x\n---\n\nJust prose.\n")).toEqual({
      heading: "",
      instructions: "Just prose.",
    });
    expect(splitSkillBody("---\nname: x\n---\n\n## Steps\n\nRun it.\n")).toEqual({
      heading: "",
      instructions: "## Steps\n\nRun it.",
    });
    expect(joinSkillBody("", "Just prose.")).toBe("Just prose.");
  });

  it("reads a file with no frontmatter at all", () => {
    expect(splitSkillBody("# Deploy\n\nRun it.\n")).toEqual({
      heading: "# Deploy",
      instructions: "Run it.",
    });
  });
});
