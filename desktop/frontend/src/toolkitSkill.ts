// Writing a new skill: the name the folder gets, the file it starts as, where
// it may go, and which copy the agent will actually use once it is there.

import type { AgentCapability, CapabilityRoot } from "./toolkit";
import { CLI_LABELS, shortPath, splitFrontmatter } from "./toolkit";

export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 1024;

// The folder Codex reads that Gemini and OpenCode read too, so a skill written
// there is not a Codex skill.
const SHARED_SKILLS_DIR = /\/\.agents\/skills\/?$/;

// What the field shows while typing: lower-cased, non-alphanumeric runs
// collapsed to hyphens, capped at 64. A trailing hyphen survives — stripping it
// live makes the field collapse under the user's fingers halfway through
// "deploy-web". `slugify` is not reused: it keeps `.` and `_`, which are legal
// directory names but not skill names, and a leading `.` would hide the folder.
export function skillNameDraft(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, SKILL_NAME_MAX);
}

// The value actually submitted.
export function skillName(raw: string): string {
  return skillNameDraft(raw).replace(/-+$/, "");
}

export function skillNameError(name: string): string | null {
  if (!name) return "Give the skill a name.";
  if (name.length > SKILL_NAME_MAX) return "Keep the name to 64 characters or fewer.";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    return "Use lowercase letters, numbers and hyphens.";
  }
  return null;
}

export function skillDescriptionError(text: string): string | null {
  if (!text.trim()) return "Say what it does and when to use it.";
  if (text.length > SKILL_DESCRIPTION_MAX) return "That's longer than a description can be.";
  // Both CLIs drop a skill whose description contains an angle bracket, and
  // report only an aggregate count of what they skipped.
  if (/[<>]/.test(text)) return "Skip the < and > characters here.";
  return null;
}

// A skill whose file says nothing is a name the agent can open and learn
// nothing from, so the instructions are as required as the description.
export function skillInstructionsError(text: string): string | null {
  if (!text.trim()) return "Say what the agent should do once it opens this.";
  return null;
}

export function titleCaseSkillName(name: string): string {
  return name
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function skillFilePath(root: string, name: string): string {
  return `${root.replace(/\/+$/, "")}/${name}/SKILL.md`;
}

// A double-quoted scalar is what lpm's own bundled skills use: it round-trips
// through any YAML parser and survives a naive line-based reader. Several lines
// cannot be quoted that way, so they fold — each one re-indented, because an
// extra-indented line inside a folded block keeps its own line breaks.
function yamlDescription(description: string): string {
  if (/\r?\n/.test(description)) {
    const lines = description.split(/\r?\n/).map((line) => `  ${line.trim()}`.trimEnd());
    return [">-", ...lines].join("\n");
  }
  return `"${description.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// Only `name` and `description` by default: every other key either fails one
// vendor's validator or duplicates something the loader already knows. The
// frontmatter name is the directory name by construction, since the directory
// wins at load time in both CLIs and a drifting pair is a bug nobody sees.
// `manual` adds the key Claude honours for that: the skill leaves the model's
// context entirely and runs only when the user asks for it by name. Codex reads
// a file beside this one instead, which the create command writes.
export function skillTemplate(
  name: string,
  description: string,
  manual: boolean,
  instructions: string,
): string {
  return [
    "---",
    // Quoted, because `no`, `on`, `off`, `y` and `n` are all legal skill names
    // and all read as booleans to a YAML 1.1 parser.
    `name: "${name}"`,
    `description: ${yamlDescription(description)}`,
    ...(manual ? ["disable-model-invocation: true"] : []),
    "---",
    "",
    `# ${titleCaseSkillName(name)}`,
    "",
    instructions,
    "",
  ].join("\n");
}

function unquote(value: string): string {
  if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  if (value.length > 1 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

// The description already in a skill's file, as the edit form should show it —
// the inverse of `yamlDescription`. A folded value is read back from the lines
// under the key, which is why `splitFrontmatter` cannot answer this: its chips
// carry the first line only, and for a folded value that is the `>-` marker.
export function skillDescription(content: string): string {
  const match = /^\ufeff?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return "";
  const lines = match[1].split(/\r?\n/);
  const at = lines.findIndex((line) => /^description\s*:/.test(line));
  if (at < 0) return "";
  const value = lines[at].slice(lines[at].indexOf(":") + 1).trim();
  if (!/^[>|]/.test(value)) return unquote(value);
  const folded: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() && !/^\s/.test(line)) break;
    folded.push(line.trim());
  }
  return folded.join("\n").replace(/\n+$/, "");
}

// A skill file's prose, split the way the edit form shows it. The heading lpm
// writes from the name is not instructions and not something to retype, so it
// rides along outside the field and goes back on top of whatever is saved. Any
// other opening heading is treated the same way: lifting it out and putting it
// back loses nothing, and leaving it in the field invites a second one.
export function splitSkillBody(content: string): { heading: string; instructions: string } {
  const body = splitFrontmatter(content).body;
  const heading = /^\s*(#[ \t][^\n]*)(?:\r?\n|$)/.exec(body);
  if (!heading) return { heading: "", instructions: body.trim() };
  return { heading: heading[1].trim(), instructions: body.slice(heading[0].length).trim() };
}

// The inverse: what goes under the frontmatter once the form is saved, in the
// shape `skillTemplate` writes so a skill lpm made and a skill lpm edited read
// the same.
export function joinSkillBody(heading: string, instructions: string): string {
  return heading ? `${heading}\n\n${instructions}` : instructions;
}

// The rows lpm may rewrite: a skill in a folder it owns the format of, never a
// plugin's copy, and never a listing scanned over SSH. The list's pencil and
// the detail's Edit tab read this one answer — a pencil that opens a view with
// no form in it is a bug.
export function editableSkill(cap: AgentCapability, local: boolean): boolean {
  return local && cap.kind === "skill" && cap.editable;
}

export interface SkillDestination {
  path: string;
  cli: string;
  scope: string;
  label: string;
  exists: boolean;
}

export function isSharedSkillsDir(path: string): boolean {
  return SHARED_SKILLS_DIR.test(path);
}

function destinationLabel(root: CapabilityRoot): string {
  const cli = CLI_LABELS[root.cli] ?? root.cli;
  if (root.cli === "codex") {
    return isSharedSkillsDir(root.path) ? "Codex, Gemini and OpenCode" : cli;
  }
  return root.scope === "project" ? `${cli}, in this project` : cli;
}

// The roots the scan says hold skills, in scan order. Empty over SSH, because
// the remote scan registers no skill root.
export function skillDestinations(roots: CapabilityRoot[]): SkillDestination[] {
  return roots
    .filter((root) => root.kind === "skill")
    .map((root) => ({
      path: root.path,
      cli: root.cli,
      scope: root.scope,
      label: destinationLabel(root),
      exists: root.exists,
    }));
}

export function defaultDestination(
  dests: SkillDestination[],
  cli: "all" | "claude" | "codex",
): string {
  const pick =
    cli === "codex"
      ? (dests.find((d) => d.cli === "codex" && isSharedSkillsDir(d.path)) ??
        dests.find((d) => d.cli === "codex"))
      : dests.find((d) => d.cli === "claude" && d.scope === "user");
  return (pick ?? dests[0])?.path ?? "";
}

export type SkillClash =
  | { tone: "bad"; text: string; existingPath: string }
  | { tone: "warn"; text: string };

// The hard stop and the soft warnings. Skills resolve ["user", "project"], so
// the personal copy wins — the opposite of subagents and commands. Nothing is
// claimed from a listing that ran out of room: "no conflict" would be a guess.
export function skillClash(
  name: string,
  dest: SkillDestination | null,
  items: AgentCapability[],
  truncated: boolean,
): SkillClash | null {
  if (!name || !dest || truncated) return null;

  // Plugin copies are left out: they are ranked nowhere, so they never compete
  // for the name. A copy under the other CLI is a separate skill entirely.
  const rivals = items.filter(
    (i) => i.kind === "skill" && i.name === name && i.cli === dest.cli && i.scope !== "plugin",
  );
  const here = rivals.find((i) => i.path === skillFilePath(dest.path, name));
  if (here) {
    return {
      tone: "bad",
      text: `A skill called ${name} is already in ${shortPath(dest.path)}.`,
      existingPath: here.path,
    };
  }

  const cli = CLI_LABELS[dest.cli] ?? dest.cli;
  if (dest.scope === "user" && rivals.some((i) => i.scope === "project")) {
    return { tone: "warn", text: `${cli} will use this one instead of the copy in this project.` };
  }
  if (dest.scope === "project" && rivals.some((i) => i.scope === "user")) {
    return {
      tone: "warn",
      text: `You already have a personal copy of this name, and ${cli} uses that one. This copy will not load.`,
    };
  }
  if (rivals.some((i) => i.scope === dest.scope)) {
    return {
      tone: "warn",
      text: `${cli} already has a skill with this name. Which one it uses is not defined.`,
    };
  }
  return null;
}

// Same-named copies elsewhere, for the delete confirmation. Across CLIs, since
// ~/.claude/skills/x and ~/.agents/skills/x are one skill to the user.
export function skillSiblings(
  cap: AgentCapability,
  items: AgentCapability[],
): AgentCapability[] {
  if (cap.kind !== "skill") return [];
  return items.filter(
    (i) =>
      i.kind === "skill" && i.name === cap.name && i.path !== cap.path && i.scope !== "plugin",
  );
}
