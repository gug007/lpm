import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  CLAUDE_ACCOUNTS_PATH,
  CONNECT_AGENTS_PATH,
  REVIEW_CHANGES_PATH,
  TOKEN_USAGE_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  webPageJsonLd,
} from "@/lib/structured-data";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Hero from "./_components/hero";
import HowItWorks from "./_components/how-it-works";
import Insights from "./_components/insights";
import Outcomes from "./_components/outcomes";
import Privacy from "./_components/privacy";
import StatsPreview from "./_components/stats-preview";

const TITLE = "Claude Code & Codex Token Usage Tracker";
const DESCRIPTION =
  "Track Claude Code and Codex tokens, estimated cost, cache usage, projects, models, and sessions locally on your Mac. Prompts and responses are not included.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "Claude Code token usage",
    "Codex token usage",
    "Claude Code usage tracker",
    "Codex usage tracker",
    "AI coding agent usage tracker",
    "Claude Code cost tracker",
    "token usage by project",
  ],
  alternates: {
    canonical: TOKEN_USAGE_PATH,
  },
  openGraph: {
    title: TITLE,
    description:
      "See Claude Code and Codex tokens, estimated cost, cache usage, projects, models, and sessions in one private Mac dashboard.",
    type: "website",
    url: TOKEN_USAGE_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Track Claude Code and Codex token usage by day, project, provider, model, and session—locally on your Mac.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: TOKEN_USAGE_PATH,
    about: [
      "Claude Code token usage",
      "Codex token usage",
      "AI coding agent usage analytics",
      "token usage by project",
      "local AI usage dashboard",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Claude Code & Codex Token Usage", path: TOKEN_USAGE_PATH },
  ]),
];

export default function ClaudeCodeCodexTokenUsagePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <StatsPreview />
      <Outcomes />
      <Insights />
      <HowItWorks />
      <Privacy />
      <Faq />
      <RelatedPages
        links={[
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "Run AI coding agents in parallel while every service, terminal, and project stays in view.",
          },
          {
            href: CLAUDE_ACCOUNTS_PATH,
            title: "Multiple Claude Code accounts",
            description:
              "Pin work and personal Claude accounts to separate projects and run them side by side.",
          },
          {
            href: CONNECT_AGENTS_PATH,
            title: "Connect agents to your dev environment",
            description:
              "Give Claude Code and Codex tools to start services, read logs, and work across parallel copies.",
          },
          {
            href: REVIEW_CHANGES_PATH,
            title: "Review AI agent changes",
            description:
              "Inspect every file an agent changed in a native diff view before you commit.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
