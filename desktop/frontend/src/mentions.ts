// Model + matching for the composer's "@" autocomplete, which lets a prompt
// reference a project, a project duplicate, or a file/folder under the terminal's
// working dir. The accepted item is inserted as literal "@<insert>" text — the
// AI agent reading the terminal resolves it — so no editor chip is involved.

import { basename } from "./path";

export type MentionKind = "file" | "dir" | "project" | "duplicate";

export interface MentionItem {
  kind: MentionKind;
  // What the menu row shows (a relative path, or a project's name/label).
  label: string;
  // The text inserted after "@" (a relative path, or a project's root path).
  insert: string;
  // Secondary, dimmed text (a project's root path); omitted for files.
  detail?: string;
}

// The active "@<frag>" query on the caret's line, or no match. The "@" may sit
// mid-line but must follow whitespace (or the line start) so an address like
// "me@host" or "pkg@1.2" never triggers it; the fragment runs to the caret and
// holds no spaces (a space ends the mention) — but may hold "/" for paths.
export const MENTION_TRIGGER = /(?:^|\s)@([^\s@]*)$/;

// Cap the rendered list; the menu is for picking, not browsing a whole tree.
const LIMIT = 50;

// Projects/duplicates come ahead of files; within that pool a basename-prefix
// hit beats a full-path prefix beats a substring, so "@comp" surfaces
// "Composer.tsx" above a deep path that merely contains "comp". An empty
// fragment (a lone "@") returns the head of the pool so the menu is browsable.
export function rankMentions(
  projects: MentionItem[],
  files: MentionItem[],
  frag: string,
): MentionItem[] {
  const pool = projects.concat(files);
  const q = frag.toLowerCase();
  if (!q) return pool.slice(0, LIMIT);
  const buckets: MentionItem[][] = [[], [], [], []];
  for (const it of pool) {
    const name = basename(it.label).toLowerCase();
    const full = it.insert.toLowerCase();
    if (name.startsWith(q)) buckets[0].push(it);
    else if (full.startsWith(q)) buckets[1].push(it);
    else if (name.includes(q)) buckets[2].push(it);
    else if (full.includes(q)) buckets[3].push(it);
  }
  return buckets.flat().slice(0, LIMIT);
}
