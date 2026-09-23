import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  CLAUDE_ACCOUNTS_PATH,
  LINUX_HOST_PATH,
  MOBILE_PATH,
  PARALLEL_PATH,
  REVIEW_CHANGES_PATH,
  WORKTREE_AGENTS_PATH,
  WORKTREE_ALTERNATIVE_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdString,
  screenRecordingJsonLd,
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
  "A Git worktree alternative for Mac: lpm Duplicate makes standalone project copies with your .env, dependencies and uncommitted work, ready for agents.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "git worktree alternative",
    "git worktree vs clone",
    "git worktree limitations",
    "claude code git worktree",
    "codex git worktree",
    "git worktree env file",
    "git worktree node_modules",
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
      "Worktrees isolate a checkout. lpm Duplicate copies the whole project, local files and dependencies included, into standalone copies and queues an agent task in each.",
    type: "website",
    url: WORKTREE_ALTERNATIVE_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Git worktree vs lpm Duplicate: a linked checkout, or a standalone copy of the project with your .env, dependencies and uncommitted work.",
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
  screenRecordingJsonLd("duplicate-project"),
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
            href: WORKTREE_AGENTS_PATH,
            title: "Git worktrees for Claude Code & Codex",
            description:
              "What a worktree does not carry, what the agents create natively, and all five isolation models compared.",
          },
          {
            href: PARALLEL_PATH,
            title: "Run Claude Code in parallel",
            description:
              "Fan one prompt out to Duplicates, watch each agent's status, then keep the diff that works.",
          },
          {
            href: LINUX_HOST_PATH,
            title: "Fan out on a Linux server",
            description:
              "Duplicate a project on a server you own, so the copying and the agents run there instead of on your laptop.",
          },
          {
            href: CLAUDE_ACCOUNTS_PATH,
            title: "Multiple Claude Code accounts",
            description:
              "Copies keep the project's pinned Claude account, so five copies of a work repo all run as work.",
          },
          {
            href: MOBILE_PATH,
            title: "Duplicate from your iPhone",
            description:
              "Make copies, queue a command in each, and run one prompt across fresh copies from the lpm iPhone app.",
          },
          {
            href: REVIEW_CHANGES_PATH,
            title: "Review agent changes",
            description:
              "Inspect every changed file and diff before you commit the result from a parallel agent run.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
