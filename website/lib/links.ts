export const REPO_URL = "https://github.com/gug007/lpm";
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
export const AI_AGENTS_PATH = "/best-terminal-for-claude-code-and-codex";
export const INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/gug007/lpm/main/install.sh";
export const INSTALL_CMD = `curl -fsSL ${INSTALL_SCRIPT_URL} | bash`;

export function releaseAsset(filename: string): string {
  return `${RELEASES_URL}/download/${filename}`;
}

export const THEME_STORAGE_KEY = "lpm-site-theme";
