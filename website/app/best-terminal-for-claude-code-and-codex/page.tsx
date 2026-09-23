import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  AUTOMATIONS_PATH,
  CLAUDE_ACCOUNTS_PATH,
  CONNECT_AGENTS_PATH,
  PARALLEL_PATH,
  SKILLS_PATH,
  TOKEN_USAGE_PATH,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";
import Alerts from "./_components/alerts";
import Benefits from "./_components/benefits";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import WhyParallel from "./_components/why-parallel";
import Workflows from "./_components/workflows";

const TITLE = "Best Terminal for Claude Code and Codex on Mac (2026)";
const DESCRIPTION =
  "The best terminal for Claude Code and Codex on Mac: live status per agent, a chime or banner when one needs you, plan limits, and your dev servers beside them.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "best terminal for claude code",
    "best terminal for codex",
    "claude code terminal",
    "codex terminal",
    "claude code notifications",
    "claude code mac app",
  ],
  alternates: {
    canonical: AI_AGENTS_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: AI_AGENTS_PATH,
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
    path: AI_AGENTS_PATH,
    about: [
      "best terminal for Claude Code",
      "best terminal for Codex",
      "Claude Code and Codex status alerts",
      "Claude Code and Codex usage limits",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    {
      name: "Best Terminal for Claude Code and Codex",
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
      <Alerts />
      <Benefits />
      <Workflows />
      <Comparison />
      <Faq />
      <RelatedPages
        links={[
          {
            href: PARALLEL_PATH,
            title: "Run Claude Code in parallel",
            description:
              "Send one prompt to several copies of your project and keep the best answer.",
          },
          {
            href: CONNECT_AGENTS_PATH,
            title: "Let agents drive lpm",
            description:
              "Give Claude Code and Codex a CLI to start services, read logs, and wait for a server before running tests.",
          },
          {
            href: AUTOMATIONS_PATH,
            title: "Schedule Claude Code tasks",
            description:
              "Run a Claude Code or Codex prompt on a schedule and read the answer when you are back.",
          },
          {
            href: SKILLS_PATH,
            title: "Claude Code & Codex skills",
            description:
              "Browse the skills, MCP servers and hooks a folder loads for Claude Code and Codex, and draft new skills in a form.",
          },
          {
            href: TOKEN_USAGE_PATH,
            title: "Claude Code & Codex token usage",
            description:
              "Tokens, estimated spend, cache hits, and sessions per project in one local dashboard.",
          },
          {
            href: CLAUDE_ACCOUNTS_PATH,
            title: "Multiple Claude Code accounts",
            description:
              "Pin a Claude account to each project, so work and personal run side by side, each signed in once.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
