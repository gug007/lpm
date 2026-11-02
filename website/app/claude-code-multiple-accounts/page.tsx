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
import SwitchTabLesson from "./_components/switch-tab-lesson";
import Workflows from "./_components/workflows";

const TITLE = "Multiple Claude Code Accounts — No Logging Out";
const DESCRIPTION =
  "Pin a Claude Code account to each project, move a running conversation to another account mid-task, or let new sessions switch when one runs low. No logout.";

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
    "claude code auto switch account",
    "claude code switch account when limit reached",
    "claude code switch account mid session",
    "continue claude code conversation on another account",
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
      "automatic Claude account switching",
      "moving a Claude Code conversation to another account",
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
  youtubeLessonJsonLd("accounts-switching"),
  youtubeLessonJsonLd("switch-claude-account-mid-session"),
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
      <SwitchTabLesson />
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
