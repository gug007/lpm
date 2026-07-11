import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  CLAUDE_ACCOUNTS_PATH,
  CONFIG_PATH,
  CONNECT_AGENTS_PATH,
} from "@/lib/links";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/structured-data";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Problem from "./_components/problem";
import Setup from "./_components/setup";
import Workflows from "./_components/workflows";

export const metadata: Metadata = {
  title: "Multiple Claude Code Accounts — One Per Project",
  description:
    "Run multiple Claude Code accounts on one Mac without logging out. lpm pins an account to each project — work and personal run in parallel, signed in once, tokens untouched.",
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
    title: "Multiple Claude Code Accounts — One Per Project",
    description:
      "Pin a Claude account to each project. Work and personal accounts run in parallel on one Mac — no logout dance, no token copying.",
    type: "website",
    url: CLAUDE_ACCOUNTS_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "Multiple Claude Code Accounts — One Per Project",
    description:
      "Pin a Claude account to each project. Work and personal accounts run in parallel on one Mac — no logout dance, no token copying.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: "Multiple Claude Code Accounts — One Per Project",
    description:
      "Run multiple Claude Code accounts on one Mac without logging out. lpm pins an account to each project — work and personal run in parallel, signed in once, tokens untouched.",
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Hero />
      <DemoSection />
      <Problem />
      <Features />
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
            href: CONFIG_PATH,
            title: "Configuration reference",
            description:
              "Every project config field — services, actions, terminals, profiles, and account pinning.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
