import type { MetadataRoute } from "next";
import {
  AI_AGENTS_PATH,
  BEST_TERMINAL_MAC_PATH,
  CLAUDE_ACCOUNTS_PATH,
  CONFIG_PATH,
  CONNECT_AGENTS_PATH,
  GIT_TERMINAL_MAC_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  MOBILE_PATH,
  PRIVACY_PATH,
  REVIEW_CHANGES_PATH,
  SITE_URL,
  SSH_TERMINAL_MAC_PATH,
  STATS_PATH,
  STATUSLINE_PATH,
  TERMS_PATH,
  TOKEN_USAGE_PATH,
  VS_BASE_PATH,
  VS_SLUGS,
  WORKTREE_ALTERNATIVE_PATH,
  vsPath,
} from "@/lib/links";

const LAST_MODIFIED: Record<string, string> = {
  "/": "2026-07-16",
  [CONFIG_PATH]: "2026-07-16",
  [AI_AGENTS_PATH]: "2026-07-16",
  [CLAUDE_ACCOUNTS_PATH]: "2026-07-19",
  [BEST_TERMINAL_MAC_PATH]: "2026-07-16",
  [MAC_TERMINAL_DEVELOPERS_PATH]: "2026-06-12",
  [GIT_TERMINAL_MAC_PATH]: "2026-07-16",
  [SSH_TERMINAL_MAC_PATH]: "2026-07-16",
  [REVIEW_CHANGES_PATH]: "2026-07-16",
  [CONNECT_AGENTS_PATH]: "2026-07-16",
  [WORKTREE_ALTERNATIVE_PATH]: "2026-07-23",
  [TOKEN_USAGE_PATH]: "2026-07-20",
  [STATUSLINE_PATH]: "2026-07-23",
  [MOBILE_PATH]: "2026-07-16",
  [VS_BASE_PATH]: "2026-07-16",
  [vsPath("foreman")]: "2026-07-16",
  [vsPath("overmind")]: "2026-07-16",
  [vsPath("docker-compose")]: "2026-07-16",
  [vsPath("tmux")]: "2026-07-16",
  [vsPath("pm2")]: "2026-07-16",
  [vsPath("cmux")]: "2026-07-16",
  [STATS_PATH]: "2026-07-16",
  [PRIVACY_PATH]: "2026-07-08",
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
      url: `${SITE_URL}${CLAUDE_ACCOUNTS_PATH}`,
      lastModified: lastModified(CLAUDE_ACCOUNTS_PATH),
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
      url: `${SITE_URL}${REVIEW_CHANGES_PATH}`,
      lastModified: lastModified(REVIEW_CHANGES_PATH),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}${MOBILE_PATH}`,
      lastModified: lastModified(MOBILE_PATH),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}${CONNECT_AGENTS_PATH}`,
      lastModified: lastModified(CONNECT_AGENTS_PATH),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}${WORKTREE_ALTERNATIVE_PATH}`,
      lastModified: lastModified(WORKTREE_ALTERNATIVE_PATH),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}${TOKEN_USAGE_PATH}`,
      lastModified: lastModified(TOKEN_USAGE_PATH),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}${STATUSLINE_PATH}`,
      lastModified: lastModified(STATUSLINE_PATH),
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
      changeFrequency: "weekly",
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
