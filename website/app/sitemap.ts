import type { MetadataRoute } from "next";
import { AI_AGENTS_PATH } from "@/lib/links";

const SITE_URL = "https://lpm.cx";

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
  ];
}
