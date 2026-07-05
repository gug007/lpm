import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  GIT_TERMINAL_MAC_PATH,
  REVIEW_CHANGES_PATH,
} from "@/lib/links";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/structured-data";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Problem from "./_components/problem";
import ReviewDemo from "./_components/review-demo";
import Workflows from "./_components/workflows";

const TITLE = "Review Changes in the Terminal — Diff Review for Mac";
const DESCRIPTION =
  "Review code changes in your terminal with lpm — a full file-by-file diff viewer built into a native macOS workspace. See what changed before you commit, right next to your running services and AI agents.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
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
      "Review every change before you commit, without leaving your terminal. A native macOS diff review, one keystroke away.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: REVIEW_CHANGES_PATH,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Review Changes in the Terminal", path: REVIEW_CHANGES_PATH },
  ]),
];

export default function ReviewChangesInTerminalPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
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
            title: "Terminal for Claude Code & Codex",
            description:
              "Run AI coding agents in parallel and review what they change without switching apps.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
