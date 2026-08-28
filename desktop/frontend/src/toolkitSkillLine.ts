// The one-line form for a new skill: its name, the folder it goes in, and who
// may run it, all typed into a single field. `@` picks a folder, `/` picks who
// runs it, and everything else is the name — slugified as it is typed, exactly
// as the old name field did.

import type { SkillDestination } from "./toolkitSkill";
import { isSharedSkillsDir, skillNameDraft } from "./toolkitSkill";

// Neither trigger survives slugification, so the last one left in the value is
// always the fragment still being typed. That makes the caret irrelevant here:
// no selection tracking, and no second source of truth for what is committed.
const FRAGMENT = /([@/])([a-zA-Z0-9-]*)$/;

export type LineTrigger = "@" | "/";

export interface LineParse {
  name: string;
  trigger: LineTrigger | null;
  query: string;
}

// A hyphen the user is mid-way through typing survives, but the separator that
// ran into a token does not: "deploy-web @cl" is a name and a fragment, never
// the name "deploy-web-".
function headName(head: string): string {
  return skillNameDraft(head).replace(/-+$/, "");
}

export function parseLine(value: string): LineParse {
  const match = FRAGMENT.exec(value);
  if (!match) return { name: skillNameDraft(value), trigger: null, query: "" };
  return {
    name: headName(value.slice(0, match.index)),
    trigger: match[1] as LineTrigger,
    query: match[2].toLowerCase(),
  };
}

// What the field shows back while typing.
export function draftLine(raw: string): string {
  const match = FRAGMENT.exec(raw);
  if (!match) return skillNameDraft(raw);
  const name = headName(raw.slice(0, match.index));
  const fragment = `${match[1]}${match[2].toLowerCase()}`;
  return name ? `${name} ${fragment}` : fragment;
}

export interface LineToken {
  token: string;
  kind: "dest" | "mode";
  title: string;
  hint: string;
  // Empty for a mode: only a destination names a folder.
  path: string;
  disabled: boolean;
}

// Short enough to type, and stable across machines: they describe which agent
// reads the folder, which is the only thing the choice decides.
function destinationToken(dest: SkillDestination): string {
  if (dest.cli === "claude") return dest.scope === "project" ? "@project" : "@claude";
  if (dest.cli === "codex") return isSharedSkillsDir(dest.path) ? "@agents" : "@codex";
  return `@${skillNameDraft(dest.cli) || "elsewhere"}`;
}

export interface LineTokenInput {
  destinations: SkillDestination[];
  manual: boolean;
  // Only Claude honours the opt-out key, so under a Codex folder the mode is
  // offered greyed rather than hidden: it explains itself instead of vanishing.
  manualAllowed: boolean;
  slash: string;
}

export function lineTokens({
  destinations,
  manual,
  manualAllowed,
  slash,
}: LineTokenInput): LineToken[] {
  const taken = new Set<string>();
  const dests = destinations.map((dest) => {
    const base = destinationToken(dest);
    let token = base;
    for (let n = 2; taken.has(token); n += 1) token = `${base}-${n}`;
    taken.add(token);
    return {
      token,
      kind: "dest" as const,
      title: dest.label,
      hint: dest.exists ? "" : "will be created",
      path: dest.path,
      disabled: false,
    };
  });

  const mode: LineToken = manual
    ? {
        token: "/auto",
        kind: "mode",
        title: "Your agent, when it fits",
        hint: "Picked up on its own whenever the description matches the task.",
        path: "",
        disabled: false,
      }
    : {
        token: "/manual",
        kind: "mode",
        title: "Only you",
        hint: manualAllowed
          ? `Runs when you type ${slash} — agents never trigger it, and it costs no context.`
          : "Only Claude Code skills can be kept from the agent.",
        path: "",
        disabled: !manualAllowed,
      };

  return [...dests, mode];
}

export function matchTokens(
  tokens: LineToken[],
  trigger: LineTrigger | null,
  query: string,
): LineToken[] {
  const kind = trigger === "/" ? "mode" : trigger === "@" ? "dest" : null;
  const pool = kind ? tokens.filter((t) => t.kind === kind) : tokens;
  if (!query) return pool;
  return pool.filter(
    (t) => t.token.slice(1).startsWith(query) || t.title.toLowerCase().includes(query),
  );
}

export function tokenFor(tokens: LineToken[], destPath: string): LineToken | null {
  return tokens.find((t) => t.kind === "dest" && t.path === destPath) ?? null;
}
