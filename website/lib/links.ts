export const SITE_URL = "https://lpm.cx";
export const REPO_URL = "https://github.com/gug007/lpm";
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
export const AI_AGENTS_PATH = "/best-terminal-for-claude-code-and-codex";
export const PRIVACY_PATH = "/privacy";
export const TERMS_PATH = "/terms";
export const STATS_PATH = "/stats";
export const DEMO_ANCHOR = "#demo";
export const BEST_TERMINAL_MAC_PATH = "/best-terminal-for-mac";
export const MAC_TERMINAL_DEVELOPERS_PATH = "/mac-terminal-for-developers";
export const GIT_TERMINAL_MAC_PATH = "/git-terminal-for-mac";
export const VS_BASE_PATH = "/vs";
export const VS_SLUGS = [
  "foreman",
  "overmind",
  "docker-compose",
  "tmux",
  "pm2",
] as const;
export type VsSlug = (typeof VS_SLUGS)[number];
export const vsPath = (slug: VsSlug): string => `${VS_BASE_PATH}/${slug}`;
export const INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/gug007/lpm/main/install.sh";
export const INSTALL_CMD = `curl -fsSL ${INSTALL_SCRIPT_URL} | bash`;
export const TELEGRAM_URL = "https://t.me/lpm_desktop";

export function releaseAsset(filename: string): string {
  return `${RELEASES_URL}/download/${filename}`;
}

export const THEME_STORAGE_KEY = "lpm-site-theme";
