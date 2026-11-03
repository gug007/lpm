import {
  AI_AGENTS_PATH,
  AUTOMATIONS_PATH,
  BEST_TERMINAL_MAC_PATH,
  CHANGELOG_PATH,
  CLAUDE_ACCOUNTS_PATH,
  CONNECT_AGENTS_PATH,
  DOCS_PATH,
  FEATURES_PATH,
  GIT_TERMINAL_MAC_PATH,
  LESSONS_PATH,
  LIMIT_CALCULATOR_PATH,
  LINUX_HOST_PATH,
  LINUX_TERMINAL_DEVELOPERS_PATH,
  MAC_MINI_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  MOBILE_PATH,
  PARALLEL_PATH,
  PRIVACY_PATH,
  PROJECT_SIDEBAR_PATH,
  REVIEW_CHANGES_PATH,
  SECURITY_PATH,
  SHARE_TERMINAL_PATH,
  SKILLS_PATH,
  SSH_TERMINAL_MAC_PATH,
  STATS_PATH,
  STATUSLINE_PATH,
  TERMS_PATH,
  TOKEN_USAGE_PATH,
  WINDOWS_TERMINAL_DEVELOPERS_PATH,
  WORKTREE_AGENTS_PATH,
  WORKTREE_ALTERNATIVE_PATH,
  type VsSlug,
} from "./links";

export type FooterLink = { href: string; label: string };

export type FooterGroup = {
  heading: string;
  links: FooterLink[];
  withLessons?: boolean;
  // Guide pages, as opposed to the site's own pages; /llms.txt lists them.
  guides?: boolean;
};

export const COMPARE_LABELS: Record<VsSlug, string> = {
  foreman: "Foreman",
  overmind: "Overmind",
  "docker-compose": "Docker Compose",
  tmux: "tmux",
  pm2: "PM2",
  cmux: "cmux",
  iterm2: "iTerm2",
};

export const FOOTER_GROUPS: FooterGroup[] = [
  {
    heading: "Terminal",
    guides: true,
    links: [
      { href: BEST_TERMINAL_MAC_PATH, label: "Best terminal for Mac" },
      {
        href: MAC_TERMINAL_DEVELOPERS_PATH,
        label: "Mac terminal for developers",
      },
      {
        href: WINDOWS_TERMINAL_DEVELOPERS_PATH,
        label: "Terminal for Windows developers",
      },
      {
        href: LINUX_TERMINAL_DEVELOPERS_PATH,
        label: "Terminal for Linux developers",
      },
      { href: PROJECT_SIDEBAR_PATH, label: "Terminal with a project sidebar" },
      { href: GIT_TERMINAL_MAC_PATH, label: "Git terminal for Mac" },
      { href: SSH_TERMINAL_MAC_PATH, label: "SSH terminal for Mac" },
      { href: SHARE_TERMINAL_PATH, label: "Share a terminal" },
      { href: REVIEW_CHANGES_PATH, label: "Review changes in terminal" },
    ],
  },
  {
    heading: "AI agents",
    guides: true,
    links: [
      { href: AI_AGENTS_PATH, label: "Claude Code & Codex" },
      { href: PARALLEL_PATH, label: "Run Claude Code in parallel" },
      { href: AUTOMATIONS_PATH, label: "Schedule Claude Code tasks" },
      { href: CONNECT_AGENTS_PATH, label: "Connect AI agents" },
      { href: CLAUDE_ACCOUNTS_PATH, label: "Multiple Claude accounts" },
      { href: SKILLS_PATH, label: "Agent skills" },
      { href: TOKEN_USAGE_PATH, label: "Token usage & limits" },
      { href: LIMIT_CALCULATOR_PATH, label: "Claude Code limit calculator" },
      { href: STATUSLINE_PATH, label: "Statusline customization" },
      { href: LINUX_HOST_PATH, label: "Claude Code on a remote server" },
      { href: MAC_MINI_PATH, label: "Claude Code & Codex on a Mac mini" },
    ],
  },
  {
    heading: "Git worktrees",
    guides: true,
    links: [
      { href: WORKTREE_ALTERNATIVE_PATH, label: "Git worktree alternative" },
      { href: WORKTREE_AGENTS_PATH, label: "Worktrees for AI agents" },
    ],
    withLessons: true,
  },
  {
    heading: "lpm",
    links: [
      { href: FEATURES_PATH, label: "All features" },
      { href: DOCS_PATH, label: "Docs" },
      { href: LESSONS_PATH, label: "Lessons" },
      { href: MOBILE_PATH, label: "iPhone companion" },
      { href: CHANGELOG_PATH, label: "Changelog" },
      { href: STATS_PATH, label: "Download stats" },
      { href: SECURITY_PATH, label: "Security" },
      { href: PRIVACY_PATH, label: "Privacy" },
      { href: TERMS_PATH, label: "Terms" },
    ],
  },
];
