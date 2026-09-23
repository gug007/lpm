import type { MetadataRoute } from "next";
import {
  PRIVACY_PATH,
  SITE_URL,
  STATS_PATH,
  TERMS_PATH,
  VS_BASE_PATH,
} from "@/lib/links";
// Per-route git content dates; regenerate with `pnpm sitemap:dates`.
import sitemapDates from "@/lib/sitemap-dates.json";

type Entry = MetadataRoute.Sitemap[number];

const NOINDEX = new Set(["/demo"]);

const OVERRIDES: Record<string, Pick<Entry, "changeFrequency" | "priority">> = {
  "/": { changeFrequency: "weekly", priority: 1 },
  [STATS_PATH]: { changeFrequency: "weekly", priority: 0.4 },
  [PRIVACY_PATH]: { changeFrequency: "yearly", priority: 0.3 },
  [TERMS_PATH]: { changeFrequency: "yearly", priority: 0.3 },
};

const settingsFor = (path: string): Pick<Entry, "changeFrequency" | "priority"> =>
  OVERRIDES[path] ?? {
    changeFrequency: "monthly",
    priority: path.startsWith(`${VS_BASE_PATH}/`) ? 0.7 : 0.8,
  };

export default function sitemap(): MetadataRoute.Sitemap {
  return Object.entries(sitemapDates as Record<string, string>)
    .filter(([path]) => !NOINDEX.has(path))
    .sort(([a], [b]) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)))
    .map(([path, date]) => ({
      url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
      lastModified: new Date(date),
      ...settingsFor(path),
    }));
}
