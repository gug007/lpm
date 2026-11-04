import type { LpmCommand } from "../../lpmCommands";

// What a search in the Skills tab found in one skill, so its row can show why it
// matched: the parts of the text it shows, or a line of the prompt when the
// match is only in there.

export type Range = readonly [number, number];

export const MATCH_CLASS = "rounded-[2px] bg-[var(--accent-amber)]/30 text-inherit";

// Where `query` occurs in `text`, ignoring case, earliest first.
export function matchRanges(text: string, query: string): Range[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hay = text.toLowerCase();
  const out: Range[] = [];
  for (let at = hay.indexOf(q); at >= 0; at = hay.indexOf(q, at + q.length)) out.push([at, at + q.length]);
  return out;
}

// The line a row shows under a skill's name.
export function rowSummary(c: Pick<LpmCommand, "description" | "body">): string {
  return c.description || c.body.split("\n")[0];
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

const SNIPPET_SIDE = 36;

// A line of the prompt around its first match, when neither the name nor the line
// the row shows has one: otherwise the row says why it matched by itself.
export function promptSnippet(c: Pick<LpmCommand, "name" | "description" | "body">, query: string): Snippet | null {
  const q = query.trim();
  if (!q || matchRanges(c.name, q).length > 0 || matchRanges(rowSummary(c), q).length > 0) return null;
  const text = c.body.replace(/\s+/g, " ");
  const [hit] = matchRanges(text, q);
  if (!hit) return null;
  const [start, end] = hit;
  const from = Math.max(0, start - SNIPPET_SIDE);
  const to = Math.min(text.length, end + SNIPPET_SIDE);
  return {
    before: `${from > 0 ? "…" : ""}${text.slice(from, start).trimStart()}`,
    match: text.slice(start, end),
    after: `${text.slice(end, to).trimEnd()}${to < text.length ? "…" : ""}`,
  };
}
