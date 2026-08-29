import Link from "next/link";
import {
  AI_AGENTS_PATH,
  BEST_TERMINAL_MAC_PATH,
  CLAUDE_ACCOUNTS_PATH,
  CONFIG_PATH,
  CONNECT_AGENTS_PATH,
  GIT_TERMINAL_MAC_PATH,
  LINUX_HOST_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  MOBILE_PATH,
  PRIVACY_PATH,
  PROJECT_SIDEBAR_PATH,
  REPO_URL,
  REVIEW_CHANGES_PATH,
  SKILLS_PATH,
  SSH_TERMINAL_MAC_PATH,
  STATS_PATH,
  STATUSLINE_PATH,
  TELEGRAM_URL,
  TERMS_PATH,
  TOKEN_USAGE_PATH,
  VS_SLUGS,
  WORKTREE_AGENTS_PATH,
  WORKTREE_ALTERNATIVE_PATH,
  vsPath,
} from "@/lib/links";
import { GitHubStarButton } from "./github-star-button";

const COMPARE_LABELS: Record<(typeof VS_SLUGS)[number], string> = {
  foreman: "Foreman",
  overmind: "Overmind",
  "docker-compose": "Docker Compose",
  tmux: "tmux",
  pm2: "PM2",
  cmux: "cmux",
  iterm2: "iTerm2",
};

type Group = {
  heading: string;
  links: { href: string; label: string }[];
};

const GROUPS: Group[] = [
  {
    heading: "Terminal",
    links: [
      { href: BEST_TERMINAL_MAC_PATH, label: "Best terminal for Mac" },
      {
        href: MAC_TERMINAL_DEVELOPERS_PATH,
        label: "Mac terminal for developers",
      },
      { href: PROJECT_SIDEBAR_PATH, label: "Terminal with a project sidebar" },
      { href: GIT_TERMINAL_MAC_PATH, label: "Git terminal for Mac" },
      { href: SSH_TERMINAL_MAC_PATH, label: "SSH terminal for Mac" },
      { href: REVIEW_CHANGES_PATH, label: "Review changes in terminal" },
    ],
  },
  {
    heading: "AI agents",
    links: [
      { href: AI_AGENTS_PATH, label: "Claude Code & Codex" },
      { href: CONNECT_AGENTS_PATH, label: "Connect AI agents" },
      { href: CLAUDE_ACCOUNTS_PATH, label: "Multiple Claude accounts" },
      { href: SKILLS_PATH, label: "Agent skills" },
      { href: TOKEN_USAGE_PATH, label: "Token usage" },
      { href: STATUSLINE_PATH, label: "Statusline customization" },
      { href: LINUX_HOST_PATH, label: "Claude Code on a remote server" },
    ],
  },
  {
    heading: "Git worktrees",
    links: [
      { href: WORKTREE_ALTERNATIVE_PATH, label: "Git worktree alternative" },
      { href: WORKTREE_AGENTS_PATH, label: "Worktrees for AI agents" },
    ],
  },
  {
    heading: "lpm",
    links: [
      { href: CONFIG_PATH, label: "Docs" },
      { href: MOBILE_PATH, label: "iPhone companion" },
      { href: STATS_PATH, label: "Download stats" },
      { href: PRIVACY_PATH, label: "Privacy" },
      { href: TERMS_PATH, label: "Terms" },
    ],
  },
];

const headingClass =
  "text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400";
const linkClass =
  "inline-flex items-center py-1 text-[13px] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200";

export function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 py-14">
      <div data-nosnippet className="max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 min-[480px]:grid-cols-2 lg:grid-cols-4">
          {GROUPS.map((group) => (
            <nav key={group.heading} aria-label={group.heading}>
              <h2 className={headingClass}>{group.heading}</h2>
              <ul className="mt-4 space-y-1.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <nav aria-label="Comparisons" className="mt-10">
          <h2 className={headingClass}>Compare lpm with</h2>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
            {VS_SLUGS.map((slug) => (
              <li key={slug}>
                <Link href={vsPath(slug)} className={linkClass}>
                  {COMPARE_LABELS[slug]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-12 flex flex-col items-start gap-5 border-t border-gray-200 dark:border-gray-800 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <GitHubStarButton />
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 ${linkClass}`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-3.5 h-3.5"
                aria-hidden="true"
              >
                <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
              </svg>
              Ask questions on Telegram
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              Source on GitHub
            </a>
          </div>
          <p className="text-[13px] text-gray-500 dark:text-gray-400">
            Free and open source, built for Mac developers.
          </p>
        </div>
      </div>
    </footer>
  );
}
