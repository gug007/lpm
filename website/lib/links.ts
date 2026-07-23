export const SITE_URL = "https://lpm.cx";
export const REPO_SLUG = "gug007/lpm";
export const REPO_URL = `https://github.com/${REPO_SLUG}`;
export const REPO_API_URL = `https://api.github.com/repos/${REPO_SLUG}`;
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
export const AI_AGENTS_PATH = "/best-terminal-for-claude-code-and-codex";
export const CLAUDE_ACCOUNTS_PATH = "/claude-code-multiple-accounts";
export const CONFIG_PATH = "/config";
export const PRIVACY_PATH = "/privacy";
export const TERMS_PATH = "/terms";
export const STATS_PATH = "/stats";
export const DEMO_ANCHOR = "#demo";
export const BEST_TERMINAL_MAC_PATH = "/best-terminal-for-mac";
export const MAC_TERMINAL_DEVELOPERS_PATH = "/mac-terminal-for-developers";
export const GIT_TERMINAL_MAC_PATH = "/git-terminal-for-mac";
export const SSH_TERMINAL_MAC_PATH = "/ssh-terminal-for-mac";
export const REVIEW_CHANGES_PATH = "/review-changes-in-terminal";
export const CONNECT_AGENTS_PATH = "/connect-ai-agents";
export const WORKTREE_ALTERNATIVE_PATH = "/git-worktree-alternative";
export const TOKEN_USAGE_PATH = "/claude-code-codex-token-usage";
export const MOBILE_PATH = "/mobile";
export const APP_STORE_URL =
  "https://apps.apple.com/us/app/lpm-link/id6788396977";
export const VS_BASE_PATH = "/vs";
export const VS_SLUGS = [
  "foreman",
  "overmind",
  "docker-compose",
  "tmux",
  "pm2",
  "cmux",
] as const;
export type VsSlug = (typeof VS_SLUGS)[number];
export const vsPath = (slug: VsSlug): string => `${VS_BASE_PATH}/${slug}`;
export const TELEGRAM_URL = "https://t.me/lpm_desktop";

export function releaseAsset(filename: string): string {
  return `${RELEASES_URL}/download/${filename}`;
}

export const THEME_STORAGE_KEY = "lpm-site-theme";
