import type { MetadataRoute } from "next";
import {
  AI_AGENTS_PATH,
  BEST_TERMINAL_MAC_PATH,
  CONFIG_PATH,
  GIT_TERMINAL_MAC_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  PRIVACY_PATH,
  SITE_URL,
  SSH_TERMINAL_MAC_PATH,
  STATS_PATH,
  TERMS_PATH,
  VS_BASE_PATH,
  VS_SLUGS,
  vsPath,
} from "@/lib/links";

const LAST_MODIFIED: Record<string, string> = {
  "/": "2026-06-12",
  [CONFIG_PATH]: "2026-06-12",
  [AI_AGENTS_PATH]: "2026-06-12",
  [BEST_TERMINAL_MAC_PATH]: "2026-06-12",
  [MAC_TERMINAL_DEVELOPERS_PATH]: "2026-06-12",
  [GIT_TERMINAL_MAC_PATH]: "2026-06-12",
  [SSH_TERMINAL_MAC_PATH]: "2026-06-12",
  [VS_BASE_PATH]: "2026-06-12",
  [vsPath("foreman")]: "2026-06-12",
  [vsPath("overmind")]: "2026-06-12",
  [vsPath("docker-compose")]: "2026-06-12",
  [vsPath("tmux")]: "2026-06-12",
  [vsPath("pm2")]: "2026-06-12",
  [vsPath("cmux")]: "2026-06-12",
  [STATS_PATH]: "2026-05-31",
  [PRIVACY_PATH]: "2026-05-31",
  [TERMS_PATH]: "2026-04-17",
};

const lastModified = (path: string): Date => {
  const date = LAST_MODIFIED[path];
  if (!date) {
    throw new Error(`Missing LAST_MODIFIED entry for sitemap path: ${path}`);
  }
  return new Date(date);
};

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: lastModified("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}${CONFIG_PATH}`,
      lastModified: lastModified(CONFIG_PATH),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}${AI_AGENTS_PATH}`,
      lastModified: lastModified(AI_AGENTS_PATH),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}${BEST_TERMINAL_MAC_PATH}`,
      lastModified: lastModified(BEST_TERMINAL_MAC_PATH),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}${MAC_TERMINAL_DEVELOPERS_PATH}`,
      lastModified: lastModified(MAC_TERMINAL_DEVELOPERS_PATH),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}${GIT_TERMINAL_MAC_PATH}`,
      lastModified: lastModified(GIT_TERMINAL_MAC_PATH),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}${SSH_TERMINAL_MAC_PATH}`,
      lastModified: lastModified(SSH_TERMINAL_MAC_PATH),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}${VS_BASE_PATH}`,
      lastModified: lastModified(VS_BASE_PATH),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...VS_SLUGS.map((slug) => ({
      url: `${SITE_URL}${vsPath(slug)}`,
      lastModified: lastModified(vsPath(slug)),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    {
      url: `${SITE_URL}${STATS_PATH}`,
      lastModified: lastModified(STATS_PATH),
      changeFrequency: "daily",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}${PRIVACY_PATH}`,
      lastModified: lastModified(PRIVACY_PATH),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}${TERMS_PATH}`,
      lastModified: lastModified(TERMS_PATH),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
