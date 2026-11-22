import { slugify } from "@/lib/slug";
import { SEARCH_ENTRIES, type SearchEntry } from "./search-index";

export function sharedFeatureSlugs() {
  return SEARCH_ENTRIES.map(({ title }) => slugify(title));
}

export function findSharedFeature(slug: string): SearchEntry | undefined {
  return SEARCH_ENTRIES.find(({ title }) => slugify(title) === slug);
}

// A link preview has room for one sentence.
export function firstSentence(text: string) {
  const end = text.search(/[.!?](\s|$)/);
  return end === -1 ? text : text.slice(0, end + 1);
}
