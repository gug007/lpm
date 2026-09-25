import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  CLAUDE_ACCOUNTS_PATH,
  PARALLEL_PATH,
  SKILLS_PATH,
  STATUSLINE_PATH,
  TOKEN_USAGE_PATH,
  WORKTREE_ALTERNATIVE_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  webPageJsonLd,
  youtubeLessonJsonLd,
} from "@/lib/structured-data";
import { AccountsVisual } from "./_components/accounts-visual";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Lesson from "./_components/lesson";
import Problem from "./_components/problem";
import Setup from "./_components/setup";
import Workflows from "./_components/workflows";

const TITLE = "Multiple Claude Code Accounts — No Logging Out";
const DESCRIPTION =
  "Pin a Claude Code account to each project and keep work and personal signed in at once — no logout, no config swapping. Open a repo, get the right account.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "claude code multiple accounts",
    "switch claude code accounts",
    "claude code account per project",
    "run two claude code accounts",
    "claude code work and personal account",
    "claude code account switcher alternative",
    "claude code usage limit switch account",
    "CLAUDE_CONFIG_DIR per project",
  ],
  alternates: {
    canonical: CLAUDE_ACCOUNTS_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: CLAUDE_ACCOUNTS_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: CLAUDE_ACCOUNTS_PATH,
    about: [
      "multiple Claude Code accounts",
      "per-project Claude account",
      "Claude Code account switching",
      "parallel AI coding agents",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    {
      name: "Multiple Claude Code Accounts",
      path: CLAUDE_ACCOUNTS_PATH,
    },
  ]),
  youtubeLessonJsonLd("multiple-accounts"),
];

export default function ClaudeCodeMultipleAccountsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <AccountsVisual />
      <Problem />
      <Lesson />
      <Features />
      <Comparison />
      <Setup />
      <Workflows />
      <Faq />
      <RelatedPages
        links={[
          {
            href: TOKEN_USAGE_PATH,
            title: "Usage limits for every account",
            description:
              "See each Claude account's 5-hour and weekly limits on its own card, plus tokens and cost by project.",
          },
          {
            href: PARALLEL_PATH,
            title: "Run Claude Code in parallel",
            description:
              "Fan one prompt out to several copies of a project, each on the account the project is pinned to.",
          },
          {
            href: WORKTREE_ALTERNATIVE_PATH,
            title: "Git worktree alternative",
            description:
              "Standalone project copies with your local setup, which keep the parent's Claude account.",
          },
          {
            href: STATUSLINE_PATH,
            title: "Claude Code & Codex statuslines",
            description:
              "Put the model, context left and 5-hour usage under Claude Code, and tell sessions apart at a glance.",
          },
          {
            href: SKILLS_PATH,
            title: "Claude Code & Codex skills",
            description:
              "Create and edit the skills every pinned account shares, with AI drafting and per-skill context cost.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "Run Claude Code and Codex in parallel on the same codebase, with your dev stack alongside.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
