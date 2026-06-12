import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import { AI_AGENTS_PATH, vsPath } from "@/lib/links";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/structured-data";
import Benefits from "./_components/benefits";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import WhyParallel from "./_components/why-parallel";
import Workflows from "./_components/workflows";

export const metadata: Metadata = {
  title: "Best Terminal for Claude Code & Codex AI Agents",
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
    title: "Best Terminal for Claude Code & Codex AI Agents",
    description:
      "Run Claude Code and Codex side by side on the same codebase. lpm is the terminal workspace for developers using AI coding agents in parallel.",
    type: "website",
    url: AI_AGENTS_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "Best Terminal for Claude Code & Codex AI Agents",
    description:
      "Run Claude Code and Codex side by side on the same codebase. lpm is the terminal workspace for developers using AI coding agents in parallel.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: "Best Terminal for Claude Code & Codex AI Agents",
    description:
      "lpm is the terminal workspace built for running Claude Code and Codex in parallel on the same codebase. Start your dev stack in one command and keep every agent in view.",
    path: AI_AGENTS_PATH,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    {
      name: "Best Terminal for Claude Code & Codex AI Agents",
      path: AI_AGENTS_PATH,
    },
  ]),
];

export default function BestTerminalForClaudeCodeAndCodexPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
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
            href: vsPath("cmux"),
            title: "lpm vs cmux",
            description:
              "How lpm compares to cmux for running parallel AI coding agents.",
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
