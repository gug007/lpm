import Link from "next/link";
import {
  BEST_TERMINAL_MAC_PATH,
  GIT_TERMINAL_MAC_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  PRIVACY_PATH,
  SSH_TERMINAL_MAC_PATH,
  STATS_PATH,
  TELEGRAM_URL,
  TERMS_PATH,
  VS_SLUGS,
  vsPath,
} from "@/lib/links";
import { GitHubStarButton } from "./github-star-button";

const COMPARE_LABELS: Record<(typeof VS_SLUGS)[number], string> = {
  foreman: "Foreman",
  overmind: "Overmind",
  "docker-compose": "Docker Compose",
  tmux: "tmux",
  pm2: "PM2",
};

export function Footer() {
  return (
    <footer className="py-10 border-t border-gray-100 dark:border-gray-800/60 text-center">
      <div className="max-w-3xl mx-auto px-6 flex flex-col items-center gap-4">
        <p className="text-xs text-gray-300 dark:text-gray-600 tracking-wide">
          Built for developers
        </p>
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors inline-flex items-center gap-1.5"
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
        <nav
          aria-label="Guides"
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-gray-400 dark:text-gray-500"
        >
          <Link
            href={BEST_TERMINAL_MAC_PATH}
            className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Best terminal for Mac
          </Link>
          <span aria-hidden="true" className="text-gray-200 dark:text-gray-700">
            ·
          </span>
          <Link
            href={MAC_TERMINAL_DEVELOPERS_PATH}
            className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Mac terminal for developers
          </Link>
          <span aria-hidden="true" className="text-gray-200 dark:text-gray-700">
            ·
          </span>
          <Link
            href={GIT_TERMINAL_MAC_PATH}
            className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Git terminal for Mac
          </Link>
          <span aria-hidden="true" className="text-gray-200 dark:text-gray-700">
            ·
          </span>
          <Link
            href={SSH_TERMINAL_MAC_PATH}
            className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            SSH terminal for Mac
          </Link>
        </nav>
        <nav
          aria-label="Comparisons"
          className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-gray-400 dark:text-gray-500"
        >
          <span className="text-gray-300 dark:text-gray-600">Compare</span>
          {VS_SLUGS.map((slug, i) => (
            <span key={slug} className="flex items-center gap-2">
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="text-gray-200 dark:text-gray-700"
                >
                  ·
                </span>
              )}
              <Link
                href={vsPath(slug)}
                className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                {COMPARE_LABELS[slug]}
              </Link>
            </span>
          ))}
        </nav>
        <nav
          aria-label="Legal"
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-gray-400 dark:text-gray-500"
        >
          <Link
            href={STATS_PATH}
            className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Stats
          </Link>
          <span aria-hidden="true" className="text-gray-200 dark:text-gray-700">
            ·
          </span>
          <Link
            href={PRIVACY_PATH}
            className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Privacy
          </Link>
          <span aria-hidden="true" className="text-gray-200 dark:text-gray-700">
            ·
          </span>
          <Link
            href={TERMS_PATH}
            className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Terms
          </Link>
        </nav>
        <GitHubStarButton />
      </div>
    </footer>
  );
}
