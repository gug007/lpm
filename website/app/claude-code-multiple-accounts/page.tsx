import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  CLAUDE_ACCOUNTS_PATH,
  CONNECT_AGENTS_PATH,
  STATUSLINE_PATH,
  TOKEN_USAGE_PATH,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";
import { AccountsVisual } from "./_components/accounts-visual";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Problem from "./_components/problem";
import Setup from "./_components/setup";
import Workflows from "./_components/workflows";

export const metadata: Metadata = {
  title: "Multiple Claude Code Accounts — No Logging Out",
  description:
    "Pin a Claude Code account to each project and keep work and personal signed in at once — no logout, no config swapping. Open a repo, get the right account.",
  keywords: [
    "claude code multiple accounts",
    "switch claude code accounts",
    "claude code account per project",
    "run two claude code accounts",
    "claude code work and personal account",
    "claude code account switcher alternative",
  ],
  alternates: {
    canonical: CLAUDE_ACCOUNTS_PATH,
  },
  openGraph: {
    title: "Multiple Claude Code Accounts — No Logging Out",
    description:
      "Pin a Claude Code account to each project and keep work and personal signed in at once — no logout, no config swapping. Open a repo, get the right account.",
    type: "website",
    url: CLAUDE_ACCOUNTS_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "Multiple Claude Code Accounts — No Logging Out",
    description:
      "Pin a Claude Code account to each project and keep work and personal signed in at once — no logout, no config swapping. Open a repo, get the right account.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: "Multiple Claude Code Accounts — One Per Project",
    description:
      "Run multiple Claude Code accounts on one Mac without logging out — lpm pins an account to each project, so work and personal stay signed in at once.",
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
      <Features />
      <Comparison />
      <Setup />
      <Workflows />
      <Faq />
      <RelatedPages
        links={[
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "Run Claude Code and Codex in parallel on the same codebase, with your dev stack alongside.",
          },
          {
            href: CONNECT_AGENTS_PATH,
            title: "Connect AI agents to your projects",
            description:
              "Let agents start, stop, and restart services, read dev-server logs, and fan out into parallel copies.",
          },
          {
            href: TOKEN_USAGE_PATH,
            title: "Claude Code & Codex token usage",
            description:
              "Track usage across projects, providers, models, and recent sessions without sending the dashboard to the cloud.",
          },
          {
            href: STATUSLINE_PATH,
            title: "Claude Code & Codex statuslines",
            description:
              "Pick a preset, reorder the fields, and preview live — so you can tell each session apart at a glance.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
