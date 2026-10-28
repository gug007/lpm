import { AREAS } from "./areas";
import { FEATURE_AREAS } from "./feature-areas";
import { featureId } from "./feature-id";

export type SearchEntry = {
  id: string;
  areaId: string;
  areaLabel: string;
  title: string;
  body: string;
  text: string;
};

export const SEARCH_ENTRIES: SearchEntry[] = FEATURE_AREAS.flatMap((area) => {
  const areaLabel = AREAS.find(({ id }) => id === area.id)?.eyebrow ?? area.title;
  return [...area.highlights, ...area.features].map((feature) => ({
    id: featureId(feature.title),
    areaId: area.id,
    areaLabel,
    title: feature.title,
    body: feature.body,
    text: [feature.title, feature.body, feature.note, areaLabel, ...(feature.keys ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  }));
});

export function queryWords(query: string) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function titleScore(title: string, words: string[]) {
  const lower = title.toLowerCase();
  return words.reduce((score, word) => {
    if (lower.startsWith(word)) return score + 3;
    if (lower.includes(` ${word}`)) return score + 2;
    return lower.includes(word) ? score + 1 : score;
  }, 0);
}

export function searchFeatures(query: string, limit = 40): SearchEntry[] {
  const words = queryWords(query);
  if (words.length === 0) return [];
  return SEARCH_ENTRIES.filter((entry) => words.every((word) => entry.text.includes(word)))
    .map((entry) => ({ entry, score: titleScore(entry.title, words) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => entry);
}
