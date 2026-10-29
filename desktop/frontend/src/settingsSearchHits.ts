import { matchSettings, TAB_TITLES, type SettingsSearchEntry } from "./settings-registry";

const HINT_CANDIDATES = ["sound", "port", "font", "theme"];
const MAX_HINTS = 3;

export interface SearchHit {
  entry: SettingsSearchEntry;
  // The keywords that matched when nothing the result shows did.
  keywords: string[];
}

export interface SearchGroup {
  page: string;
  hits: SearchHit[];
}

export interface HighlightPart {
  text: string;
  match: boolean;
}

export function pageOf(entry: SettingsSearchEntry): string {
  return entry.kind === "row" ? TAB_TITLES[entry.tab] : entry.label;
}

function keywordsOnly(entry: SettingsSearchEntry, q: string): string[] {
  const shown = [entry.label, entry.description ?? "", pageOf(entry)];
  if (shown.some((text) => text.toLowerCase().includes(q))) return [];
  return (entry.keywords ?? []).filter((k) => k.toLowerCase().includes(q));
}

// Ranked results under their pages, pages in the order their best result
// ranks. Reading the groups top to bottom gives the keyboard order.
export function groupSearchResults(results: SettingsSearchEntry[], query: string): SearchGroup[] {
  const q = query.trim().toLowerCase();
  const groups = new Map<string, SearchHit[]>();
  for (const entry of results) {
    const page = pageOf(entry);
    const hits = groups.get(page) ?? [];
    hits.push({ entry, keywords: keywordsOnly(entry, q) });
    groups.set(page, hits);
  }
  return [...groups].map(([page, hits]) => ({ page, hits }));
}

export function highlightParts(text: string, query: string): HighlightPart[] {
  const q = query.trim().toLowerCase();
  const lower = text.toLowerCase();
  // Lowercasing can change a string's length, which would shift every range.
  if (!q || lower.length !== text.length) return [{ text, match: false }];
  const parts: HighlightPart[] = [];
  let from = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + q.length), match: true });
    from = at + q.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}

// Searches worth suggesting when nothing matched: ones that find something
// on the machine shown.
export function searchHints(entries: SettingsSearchEntry[]): string[] {
  return HINT_CANDIDATES.filter((hint) => matchSettings(entries, hint).length > 0).slice(0, MAX_HINTS);
}
