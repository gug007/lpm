import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  CONNECT_AGENTS_PATH,
  GIT_TERMINAL_MAC_PATH,
  MOBILE_PATH,
  PROJECT_SIDEBAR_PATH,
  REVIEW_CHANGES_PATH,
  WORKTREE_AGENTS_PATH,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Problem from "./_components/problem";
import ReviewDemo from "./_components/review-demo";
import Workflows from "./_components/workflows";

const TITLE = "Review Code Changes in Terminal Before You Commit";
const DESCRIPTION =
  "See what Claude Code and Codex changed before you commit: every uncommitted change as one diff stack in a native Mac terminal, beside your running services.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "review code changes",
    "review changes in terminal",
    "review code changes in terminal",
    "git diff in terminal mac",
    "terminal code review mac",
    "review git changes before commit",
    "diff viewer terminal macos",
    "review ai agent changes",
  ],
  alternates: {
    canonical: REVIEW_CHANGES_PATH,
  },
  openGraph: {
    title: TITLE,
    description:
      "A full file-by-file diff review built into your terminal — see every change before you commit, beside your running services and AI agents.",
    type: "website",
    url: REVIEW_CHANGES_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Review every change before you commit, without leaving your terminal. Press ⌘⇧R for a native macOS diff review, then commit with an AI-drafted message.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: REVIEW_CHANGES_PATH,
    about: [
      "review code changes in terminal",
      "review AI agent changes before commit",
      "git diff viewer for Mac",
      "AI commit messages",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Review Code Changes in Your Terminal", path: REVIEW_CHANGES_PATH },
  ]),
];

export default function ReviewChangesInTerminalPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <ReviewDemo />
      <Problem />
      <Features />
      <Workflows />
      <Faq />
      <RelatedPages
        links={[
          {
            href: GIT_TERMINAL_MAC_PATH,
            title: "Git terminal for Mac",
            description:
              "Branch, rebase, and push right beside your running dev servers — all in one native window.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code and Codex",
            description:
              "Live Claude Code and Codex status, alerts when one needs you, and their changes one keystroke away.",
          },
          {
            href: WORKTREE_AGENTS_PATH,
            title: "Git worktrees for AI agents",
            description:
              "Give each agent its own checkout, then review each one's diff before you merge it.",
          },
          {
            href: CONNECT_AGENTS_PATH,
            title: "Let agents drive lpm",
            description:
              "Agents boot the stack, check the logs and hold until the port answers, so changes arrive tested.",
          },
          {
            href: PROJECT_SIDEBAR_PATH,
            title: "Terminal with a project sidebar",
            description:
              "See which project's agent finished, then open it and review what it wrote.",
          },
          {
            href: MOBILE_PATH,
            title: "Review from your iPhone",
            description:
              "Read diffs, mark files viewed, and commit from the lpm Link app while the Mac does the work.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
