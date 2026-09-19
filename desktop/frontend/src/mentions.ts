// Model + matching for the composer's "@" autocomplete, which lets a prompt
// reference a project, a project duplicate, a file/folder under the terminal's
// working dir, a working-tree change, a branch, a running service's logs, or
// the terminal's own output. The "memory" kind rides the "@" pool in agent
// terminals (picking one inserts the CLI's own lpm-memory invocation) and also
// backs the "/lpm-memory <session-id>" argument completion. Most kinds insert literal "@<insert>" text the AI agent
// resolves itself; "service-log" and "terminal-log" are the exceptions — lpm
// captures the live output at pick time and injects it inline, since the agent
// can't read lpm's in-memory service pane buffer or xterm's scrollback.
//
// A bare "@" folds the bulkier sources (memory sessions, projects, terminals,
// services) behind one group row each — an item carrying `children` — that
// drills into its list on pick or hover; typing a fragment searches the
// individual items directly.

import { basename } from "./path";

export type MentionKind =
  | "file"
  | "dir"
  | "project"
  | "duplicate"
  | "changed"
  | "branch"
  | "memory"
  | "memory-save"
  | "service-log"
  | "terminal-log";

export interface MentionItem {
  kind: MentionKind;
  // What the menu row shows (a relative path, or a project/branch/service name).
  label: string;
  // The text inserted after "@" (a relative path, a project root, or a branch).
  // For a "service-log" it carries the service name; the captured log text is
  // resolved separately at pick time (see paneIndex).
  insert: string;
  // Secondary, dimmed text (a project's root path, or a service's command);
  // omitted otherwise.
  detail?: string;
  // For a "service-log", the index of the service's pane to capture
  // (its position in the project's running-services list).
  paneIndex?: number;
  // For a "terminal-log", the id of the terminal tab whose xterm scrollback to
  // capture at pick time. Absent on other kinds.
  terminalId?: string;
  // Present on a group row: the items it drills into instead of inserting
  // anything itself. The row's kind only picks its icon and tag.
  children?: MentionItem[];
}

// A group row folding `children` behind one entry of the bare "@" menu. `kind`
// picks the icon and tag; the count rides as the detail so the row reads as a
// drill-in. Null when there is nothing to fold, so the caller can skip the row.
export function mentionGroup(
  kind: MentionKind,
  label: string,
  noun: string,
  children: MentionItem[],
): MentionItem | null {
  if (children.length === 0) return null;
  const n = children.length;
  return {
    kind,
    label,
    insert: label.toLowerCase(),
    detail: `${n} ${noun}${n === 1 ? "" : "s"} ›`,
    children,
  };
}

// The active "@<frag>" query on the caret's line, or no match. The "@" may sit
// mid-line but must follow whitespace, the line start, or an image chip (the
// object-replacement char lineBeforeCaret stands a chip in as) — so an address
// like "me@host" or "pkg@1.2" never triggers it, while "@" typed right after a
// chip does. The fragment runs to the caret and holds no spaces (a space ends the
// mention) — but may hold "/" for paths.
export const MENTION_TRIGGER = /(?:^|[\s￼])@([^\s@]*)$/;

// Cap the rendered list; the menu is for picking, not browsing a whole tree.
const LIMIT = 50;

// Lower sorts first. Memory leads — one compact group row whose whole point is
// picking up prior work — then working-tree changes (the most relevant files to
// point an agent at), then projects, then the terminal's own output, then a
// service's logs, then branches, then plain files.
const GROUP_ORDER: Record<MentionKind, number> = {
  memory: 0,
  "memory-save": 0,
  changed: 1,
  project: 2,
  duplicate: 2,
  "terminal-log": 3,
  "service-log": 4,
  branch: 5,
  dir: 6,
  file: 6,
};

// Group rows lead regardless of kind, so a bare "@" opens with the drill-ins
// (Memory, Projects, Services, Terminals, in the caller's order) stacked
// together above the working-tree changes.
const order = (it: MentionItem): number => (it.children ? 0 : GROUP_ORDER[it.kind]);

// Rank one pre-ordered pool. Within a match tier a basename-prefix hit beats a
// full-path prefix beats a substring, so "@comp" surfaces "Composer.tsx" above a
// deep path that merely contains "comp"; ties keep group order (changed first).
// An empty fragment just orders the pool by group so the menu stays browsable.
// The stable sort preserves each caller's intra-group order (recency, etc.).
export function rankMentions(pool: MentionItem[], frag: string): MentionItem[] {
  const q = frag.toLowerCase();
  if (!q) {
    return [...pool].sort((a, b) => order(a) - order(b)).slice(0, LIMIT);
  }
  const buckets: MentionItem[][] = [[], [], [], []];
  for (const it of pool) {
    const name = basename(it.label).toLowerCase();
    const full = it.insert.toLowerCase();
    if (name.startsWith(q)) buckets[0].push(it);
    else if (full.startsWith(q)) buckets[1].push(it);
    else if (name.includes(q)) buckets[2].push(it);
    else if (full.includes(q)) buckets[3].push(it);
  }
  for (const b of buckets) b.sort((a, b2) => order(a) - order(b2));
  return buckets.flat().slice(0, LIMIT);
}
