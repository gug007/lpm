import type { MetadataRoute } from "next";
import {
  AI_AGENTS_PATH,
  PRIVACY_PATH,
  SITE_URL,
  STATS_PATH,
  TERMS_PATH,
  VS_BASE_PATH,
  VS_SLUGS,
  vsPath,
} from "@/lib/links";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}${AI_AGENTS_PATH}`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}${VS_BASE_PATH}`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...VS_SLUGS.map((slug) => ({
      url: `${SITE_URL}${vsPath(slug)}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    {
      url: `${SITE_URL}${STATS_PATH}`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}${PRIVACY_PATH}`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}${TERMS_PATH}`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
