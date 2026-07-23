import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  CLAUDE_ACCOUNTS_PATH,
  CONNECT_AGENTS_PATH,
  REVIEW_CHANGES_PATH,
  TOKEN_USAGE_PATH,
  WORKTREE_ALTERNATIVE_PATH,
  vsPath,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";
import Benefits from "./_components/benefits";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import WhyParallel from "./_components/why-parallel";
import Workflows from "./_components/workflows";

export const metadata: Metadata = {
  title: "Best Terminal for Claude Code & Codex — Run in Parallel",
  description:
    "lpm is the terminal workspace built for running Claude Code and Codex in parallel on the same codebase. Start your dev stack in one command and keep every agent in view.",
  keywords: [
    "best terminal for claude code",
    "best terminal for codex",
    "claude code terminal",
    "codex terminal",
    "parallel ai agents",
    "ai agent workspace",
  ],
  alternates: {
    canonical: AI_AGENTS_PATH,
  },
  openGraph: {
    title: "Best Terminal for Claude Code & Codex — Run in Parallel",
    description:
      "Run Claude Code and Codex side by side on the same codebase. lpm is the terminal workspace for developers using AI coding agents in parallel.",
    type: "website",
    url: AI_AGENTS_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "Best Terminal for Claude Code & Codex — Run in Parallel",
    description:
      "Run Claude Code and Codex side by side on the same codebase. lpm is the terminal workspace for developers using AI coding agents in parallel.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: "Best Terminal for Claude Code & Codex — Run in Parallel",
    description:
      "lpm is the terminal workspace built for running Claude Code and Codex in parallel on the same codebase. Start your dev stack in one command and keep every agent in view.",
    path: AI_AGENTS_PATH,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    {
      name: "Best Terminal for Claude Code & Codex",
      path: AI_AGENTS_PATH,
    },
  ]),
];

export default function BestTerminalForClaudeCodeAndCodexPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <DemoSection />
      <WhyParallel />
      <Features />
      <Benefits />
      <Workflows />
      <Comparison />
      <Faq />
      <RelatedPages
        links={[
          {
            href: CONNECT_AGENTS_PATH,
            title: "Connect AI agents to your projects",
            description:
              "Give Claude Code and Codex a CLI to start, stop, and restart services, read logs, and fan out into parallel copies.",
          },
          {
            href: WORKTREE_ALTERNATIVE_PATH,
            title: "A Git worktree alternative for AI agents",
            description:
              "See when a standalone lpm Duplicate is a better fit than a linked worktree.",
          },
          {
            href: CLAUDE_ACCOUNTS_PATH,
            title: "Multiple Claude Code accounts",
            description:
              "Pin a Claude account to each project — work and personal run in parallel, signed in once.",
          },
          {
            href: TOKEN_USAGE_PATH,
            title: "Claude Code & Codex token usage",
            description:
              "See tokens, approximate cost, cache usage, projects, models, and sessions in one local dashboard.",
          },
          {
            href: vsPath("cmux"),
            title: "lpm vs cmux",
            description:
              "How lpm compares to cmux for running parallel AI coding agents.",
          },
          {
            href: REVIEW_CHANGES_PATH,
            title: "Review changes in terminal",
            description:
              "See a file-by-file diff of everything your agents changed before you commit.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
