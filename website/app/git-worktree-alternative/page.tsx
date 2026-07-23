import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  CONNECT_AGENTS_PATH,
  GIT_TERMINAL_MAC_PATH,
  REVIEW_CHANGES_PATH,
  WORKTREE_ALTERNATIVE_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdString,
  webPageJsonLd,
} from "@/lib/structured-data";
import AgentWorkflow from "./_components/agent-workflow";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq, { FAQ_ITEMS } from "./_components/faq";
import Hero from "./_components/hero";
import HowDuplicateWorks from "./_components/how-duplicate-works";
import QuickAnswer from "./_components/quick-answer";
import WhenToUse from "./_components/when-to-use";

const TITLE = "Git Worktree Alternative for Parallel AI Agents";
const DESCRIPTION =
  "Compare Git worktrees with lpm Duplicate: standalone macOS project copies that preserve your local setup and can launch Claude Code, Codex, or any command in parallel.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "git worktree alternative",
    "git worktree vs clone",
    "git worktree limitations",
    "claude code git worktree",
    "codex git worktree",
    "parallel ai agents",
    "run claude code in parallel",
    "standalone git copy",
    "multiple git working directories",
    "macos developer workflow",
  ],
  alternates: {
    canonical: WORKTREE_ALTERNATIVE_PATH,
  },
  openGraph: {
    title: TITLE,
    description:
      "Worktrees isolate a checkout. lpm Duplicate carries the full local project setup into standalone copies and can dispatch parallel agent tasks in one flow.",
    type: "website",
    url: WORKTREE_ALTERNATIVE_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Compare Git worktrees with standalone lpm project copies for running Claude Code, Codex, and other coding agents in parallel.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: WORKTREE_ALTERNATIVE_PATH,
    about: [
      "Git worktree alternatives",
      "Git worktree limitations",
      "parallel Claude Code sessions",
      "parallel Codex sessions",
      "standalone project copies",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    {
      name: "Git Worktree Alternative",
      path: WORKTREE_ALTERNATIVE_PATH,
    },
  ]),
  faqJsonLd(FAQ_ITEMS),
];

export default function GitWorktreeAlternativePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <QuickAnswer />
      <Comparison />
      <HowDuplicateWorks />
      <AgentWorkflow />
      <WhenToUse />
      <Faq />
      <RelatedPages
        links={[
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
            href: GIT_TERMINAL_MAC_PATH,
            title: "Git terminal for Mac",
            description:
              "A native project workspace with Git actions, live service output, and built-in terminal sessions.",
          },
          {
            href: REVIEW_CHANGES_PATH,
            title: "Review agent changes in the terminal",
            description:
              "Inspect every changed file and diff before you commit the result from a parallel agent run.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
