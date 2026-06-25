// Model + matching for the composer's "@" autocomplete, which lets a prompt
// reference a project, a project duplicate, a file/folder under the terminal's
// working dir, a working-tree change, a branch, a running service's logs, or the
// terminal's own output. Most kinds insert literal "@<insert>" text the AI agent
// resolves itself; "service-log" and "terminal-log" are the exceptions — lpm
// captures the live output at pick time and injects it inline, since the agent
// can't read lpm's in-memory tmux pane buffer or xterm's scrollback.

import { basename } from "./path";

export type MentionKind =
  | "file"
  | "dir"
  | "project"
  | "duplicate"
  | "changed"
  | "branch"
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
  // For a "service-log", the index of the service's tmux pane to capture
  // (its position in the project's running-services list).
  paneIndex?: number;
  // For a "terminal-log", the id of the terminal tab whose xterm scrollback to
  // capture at pick time. Absent on other kinds.
  terminalId?: string;
}

// The active "@<frag>" query on the caret's line, or no match. The "@" may sit
// mid-line but must follow whitespace (or the line start) so an address like
// "me@host" or "pkg@1.2" never triggers it; the fragment runs to the caret and
// holds no spaces (a space ends the mention) — but may hold "/" for paths.
export const MENTION_TRIGGER = /(?:^|\s)@([^\s@]*)$/;

// Cap the rendered list; the menu is for picking, not browsing a whole tree.
const LIMIT = 50;

// Lower sorts first. A working-tree change is the most relevant thing to point an
// agent at, then projects, then the terminal's own output, then a service's logs,
// then branches, then plain files.
const GROUP_ORDER: Record<MentionKind, number> = {
  changed: 0,
  project: 1,
  duplicate: 1,
  "terminal-log": 2,
  "service-log": 3,
  branch: 4,
  dir: 5,
  file: 5,
};

// Rank one pre-ordered pool. Within a match tier a basename-prefix hit beats a
// full-path prefix beats a substring, so "@comp" surfaces "Composer.tsx" above a
// deep path that merely contains "comp"; ties keep group order (changed first).
// An empty fragment just orders the pool by group so the menu stays browsable.
// The stable sort preserves each caller's intra-group order (recency, etc.).
export function rankMentions(pool: MentionItem[], frag: string): MentionItem[] {
  const q = frag.toLowerCase();
  if (!q) {
    return [...pool].sort((a, b) => GROUP_ORDER[a.kind] - GROUP_ORDER[b.kind]).slice(0, LIMIT);
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
  for (const b of buckets) b.sort((a, b2) => GROUP_ORDER[a.kind] - GROUP_ORDER[b2.kind]);
  return buckets.flat().slice(0, LIMIT);
}
