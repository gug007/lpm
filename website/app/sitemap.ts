import type { MetadataRoute } from "next";
import { AI_AGENTS_PATH, SITE_URL, VS_SLUGS, vsPath } from "@/lib/links";

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
    ...VS_SLUGS.map((slug) => ({
      url: `${SITE_URL}${vsPath(slug)}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
