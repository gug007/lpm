import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import {
  BEST_TERMINAL_MAC_PATH,
  GIT_TERMINAL_MAC_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  REVIEW_CHANGES_PATH,
  WORKTREE_AGENTS_PATH,
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
import Problem from "./_components/problem";
import ReviewCommit from "./_components/review-commit";
import Workflows from "./_components/workflows";
import { GIT_DEMO } from "./_components/demo-tour";

const TITLE = "Git Terminal for Mac with Built-In Diff Review";
const DESCRIPTION =
  "Branch, rebase, and push in a shell pane next to live service logs, then review every change as a diff and commit with an AI-drafted message. Free Mac app.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "git terminal for mac",
    "best git terminal for mac",
    "mac terminal for git",
    "git terminal macos",
    "terminal git workflow mac",
    "git diff viewer mac",
  ],
  alternates: {
    canonical: GIT_TERMINAL_MAC_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: GIT_TERMINAL_MAC_PATH,
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
    path: GIT_TERMINAL_MAC_PATH,
    about: [
      "git terminal for Mac",
      "git diff review on Mac",
      "AI commit messages",
      "git with dev servers in one window",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Git Terminal for Mac", path: GIT_TERMINAL_MAC_PATH },
  ]),
];

export default function GitTerminalForMacPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <DemoSection {...GIT_DEMO} />
      <Problem />
      <Features />
      <ReviewCommit />
      <Benefits />
      <Workflows />
      <Comparison />
      <Faq />
      <RelatedPages
        links={[
          {
            href: REVIEW_CHANGES_PATH,
            title: "Review changes in terminal",
            description:
              "The diff review up close: every uncommitted change, what an agent wrote included, before you commit.",
          },
          {
            href: WORKTREE_AGENTS_PATH,
            title: "Git worktrees for AI agents",
            description:
              "What a worktree carries, what it leaves behind, and when a full project copy fits better.",
          },
          {
            href: WORKTREE_ALTERNATIVE_PATH,
            title: "A Git worktree alternative",
            description:
              "When a standalone copy with your dependencies and .env beats a clean checkout.",
          },
          {
            href: MAC_TERMINAL_DEVELOPERS_PATH,
            title: "Mac terminal for developers",
            description:
              "Services detected from your repo, a log pane each, and project switching that keeps them running.",
          },
          {
            href: BEST_TERMINAL_MAC_PATH,
            title: "Best terminal for Mac",
            description:
              "Why a native Apple Silicon workspace beats Electron terminals and tab strips.",
          },
          {
            href: vsPath("tmux"),
            title: "lpm vs tmux",
            description:
              "How lpm compares to tmux for running services and shells side by side.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
