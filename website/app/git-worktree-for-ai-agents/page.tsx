import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  CONNECT_AGENTS_PATH,
  REVIEW_CHANGES_PATH,
  WORKTREE_AGENTS_PATH,
  WORKTREE_ALTERNATIVE_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdString,
  webPageJsonLd,
} from "@/lib/structured-data";
import Choose from "./_components/choose";
import Cta from "./_components/cta";
import Faq, { FAQ_ITEMS } from "./_components/faq";
import FanOut from "./_components/fan-out";
import Hero from "./_components/hero";
import IsolationMatrix from "./_components/isolation-matrix";
import NativeSupport from "./_components/native-support";
import QuickAnswer from "./_components/quick-answer";
import WhatBreaks from "./_components/what-breaks";

const TITLE = "Git Worktrees for Claude Code, Codex & AI Agents";
const DESCRIPTION =
  "How to run parallel AI coding agents on one repository: what a Git worktree does and does not carry, what Claude Code and Codex create natively, and when a standalone project copy is the better boundary.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} (2026)` },
  description: DESCRIPTION,
  keywords: [
    "git worktree claude code",
    "git worktree for claude code",
    "git worktree for agents",
    "git worktree for ai agents",
    "git worktree with claude code",
    "git worktree parallel agents",
    "git worktree multiple agents",
    "git worktree with copilot",
    "codex parallel agents",
    "claude code parallel sessions",
    "run multiple claude code instances",
    "git worktree node_modules",
    "git worktree env file",
  ],
  alternates: {
    canonical: WORKTREE_AGENTS_PATH,
  },
  openGraph: {
    title: TITLE,
    description:
      "What a worktree does not carry, what Claude Code and Codex create natively, and how lpm fans one prompt out to worktrees or standalone project copies.",
    type: "website",
    url: WORKTREE_AGENTS_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Git worktree vs lpm Worktree vs lpm Duplicate — five ways to isolate a parallel coding agent, compared.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: WORKTREE_AGENTS_PATH,
    about: [
      "Git worktrees for AI coding agents",
      "parallel Claude Code sessions",
      "parallel Codex agents",
      "Git worktree limitations",
      "standalone project copies",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Git Worktrees for AI Agents", path: WORKTREE_AGENTS_PATH },
  ]),
  faqJsonLd(FAQ_ITEMS),
];

export default function GitWorktreeForAiAgentsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <QuickAnswer />
      <WhatBreaks />
      <NativeSupport />
      <IsolationMatrix />
      <FanOut />
      <DemoSection />
      <Choose />
      <Faq />
      <RelatedPages
        links={[
          {
            href: WORKTREE_ALTERNATIVE_PATH,
            title: "Git worktree alternative",
            description:
              "The standalone-copy side of the comparison in full: what Duplicate carries that a checkout cannot.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "Run AI coding agents side by side with each project’s services, logs, and status in view.",
          },
          {
            href: CONNECT_AGENTS_PATH,
            title: "Connect AI agents to your dev environment",
            description:
              "Give agents a CLI to run services, read logs, wait for readiness, and fan out into project copies.",
          },
          {
            href: REVIEW_CHANGES_PATH,
            title: "Review agent changes in the terminal",
            description:
              "Inspect every changed file and diff before you merge the result of a parallel agent run.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
