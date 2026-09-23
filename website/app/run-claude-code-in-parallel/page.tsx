import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  AUTOMATIONS_PATH,
  CONNECT_AGENTS_PATH,
  MOBILE_PATH,
  PARALLEL_PATH,
  REVIEW_CHANGES_PATH,
  WORKTREE_AGENTS_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdString,
  webPageJsonLd,
  youtubeLessonJsonLd,
} from "@/lib/structured-data";
import Cli from "./_components/cli";
import Cta from "./_components/cta";
import FanOut from "./_components/fan-out";
import Faq from "./_components/faq";
import { FAQ_ITEMS } from "./_components/faq-data";
import Hero from "./_components/hero";
import KeepTrack from "./_components/keep-track";
import Lesson from "./_components/lesson";
import Limits from "./_components/limits";
import ParallelVisual from "./_components/parallel-visual";
import ReviewShip from "./_components/review-ship";
import ThreeWays from "./_components/three-ways";

const TITLE = "Run Claude Code in Parallel: Multiple Sessions on Mac";
const DESCRIPTION =
  "Run several Claude Code and Codex sessions at once on your Mac: tabs, project copies or Git worktrees, live status for each session, and every diff to review.";
const SOCIAL_DESCRIPTION =
  "Tabs, full project copies or Git worktrees for parallel Claude Code and Codex agents, with Working, Needs you and Done on every session.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "run claude code in parallel",
    "multiple claude code sessions",
    "run multiple claude code instances",
    "parallel claude code agents",
    "claude code parallel sessions",
    "claude code multiple projects at once",
    "run codex in parallel",
    "codex parallel agents",
    "parallel ai coding agents mac",
    "same prompt multiple claude code agents",
  ],
  alternates: {
    canonical: PARALLEL_PATH,
  },
  openGraph: {
    title: TITLE,
    description: SOCIAL_DESCRIPTION,
    type: "website",
    url: PARALLEL_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: SOCIAL_DESCRIPTION,
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: PARALLEL_PATH,
    about: [
      "running Claude Code in parallel",
      "multiple Claude Code sessions",
      "parallel Codex agents",
      "project duplicates for AI agents",
      "Git worktrees for AI agents",
      "AI agent status tracking",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Run Claude Code in Parallel", path: PARALLEL_PATH },
  ]),
  faqJsonLd(FAQ_ITEMS),
  youtubeLessonJsonLd("parallel-agents"),
];

export default function RunClaudeCodeInParallelPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <ParallelVisual />
      <ThreeWays />
      <Lesson />
      <FanOut />
      <KeepTrack />
      <ReviewShip />
      <Cli />
      <Limits />
      <Faq />
      <RelatedPages
        links={[
          {
            href: WORKTREE_AGENTS_PATH,
            title: "Git worktrees for AI agents",
            description:
              "How a worktree isolates an agent, what it leaves out, and what Claude Code and Codex create on their own.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "What a terminal needs when agents run all day, and how lpm compares with the usual picks.",
          },
          {
            href: REVIEW_CHANGES_PATH,
            title: "Review agent changes before you commit",
            description:
              "Everything an agent touched as one diff stack, with fixes and AI commits in place.",
          },
          {
            href: AUTOMATIONS_PATH,
            title: "Schedule Claude Code tasks",
            description:
              "Run an agent on a schedule — in the project, a fresh copy or a new worktree.",
          },
          {
            href: CONNECT_AGENTS_PATH,
            title: "Connect agents to your dev environment",
            description:
              "Skills and a CLI that let Claude Code and Codex start services, read logs and fan out on their own.",
          },
          {
            href: MOBILE_PATH,
            title: "Control Claude Code from your iPhone",
            description:
              "A push when an agent needs you, and a prompt box to answer it from your phone.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
