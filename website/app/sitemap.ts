import type { MetadataRoute } from "next";
import { getChangelogReleases } from "@/lib/changelog";
import { changelogDays, daysByMonth, monthPath } from "@/lib/changelog-days";
import {
  CHANGELOG_PATH,
  PRIVACY_PATH,
  SITE_URL,
  STATS_PATH,
  TERMS_PATH,
  VS_BASE_PATH,
} from "@/lib/links";
// Per-route git content dates; regenerate with `pnpm sitemap:dates`.
import sitemapDates from "@/lib/sitemap-dates.json";

type Entry = MetadataRoute.Sitemap[number];

const NOINDEX = new Set(["/demo", "/join"]);

const OVERRIDES: Record<string, Pick<Entry, "changeFrequency" | "priority">> = {
  "/": { changeFrequency: "weekly", priority: 1 },
  [STATS_PATH]: { changeFrequency: "weekly", priority: 0.4 },
  [CHANGELOG_PATH]: { changeFrequency: "daily", priority: 0.5 },
  [PRIVACY_PATH]: { changeFrequency: "yearly", priority: 0.3 },
  [TERMS_PATH]: { changeFrequency: "yearly", priority: 0.3 },
};

const settingsFor = (path: string): Pick<Entry, "changeFrequency" | "priority"> =>
  OVERRIDES[path] ?? {
    changeFrequency: "monthly",
    priority: path.startsWith(`${VS_BASE_PATH}/`) ? 0.7 : 0.8,
  };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Releases change the changelog without touching the repo.
  const releases = await getChangelogReleases();
  const dates: Record<string, string> = {
    ...sitemapDates,
    [CHANGELOG_PATH]: releases[0].date,
  };
  const months: Entry[] = [...daysByMonth(changelogDays(releases))].map(
    ([month, [newest]]) => ({
      url: `${SITE_URL}${monthPath(month)}`,
      lastModified: new Date(newest.date),
      changeFrequency: "monthly",
      priority: 0.3,
    }),
  );
  const pages = Object.entries(dates)
    .filter(([path]) => !NOINDEX.has(path))
    .sort(([a], [b]) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)))
    .map(([path, date]) => ({
      url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
      lastModified: new Date(date),
      ...settingsFor(path),
    }));
  return [...pages, ...months];
}
