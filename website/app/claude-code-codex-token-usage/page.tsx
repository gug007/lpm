import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AUTOMATIONS_PATH,
  CLAUDE_ACCOUNTS_PATH,
  FEATURES_PATH,
  MOBILE_PATH,
  PARALLEL_PATH,
  STATUSLINE_PATH,
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
import PlanLimits from "./_components/plan-limits";
import Privacy from "./_components/privacy";
import StatsPreview from "./_components/stats-preview";

const TITLE = "Claude Code & Codex Usage: Tokens, Cost & Limits";
const DESCRIPTION =
  "Track Claude Code and Codex tokens, estimated cost and cache use by project, plus live 5-hour and weekly limit meters with pace. Private, on your Mac.";

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
    "Claude Code usage limit",
    "Claude 5-hour limit tracker",
    "Claude weekly limit",
    "Codex rate limit",
    "Codex usage limit",
  ],
  alternates: {
    canonical: TOKEN_USAGE_PATH,
  },
  openGraph: {
    title: TITLE,
    description:
      "Tokens, estimated cost, cache use, projects and sessions for Claude Code and Codex, plus live 5-hour and weekly limit meters, in one private Mac app.",
    type: "website",
    url: TOKEN_USAGE_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Claude Code and Codex usage on your Mac: tokens and cost by project, and live 5-hour and weekly limits with pace.",
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
      "Claude Code usage limits",
      "Codex rate limits",
      "local AI usage dashboard",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Claude Code & Codex Usage", path: TOKEN_USAGE_PATH },
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
      <PlanLimits />
      <HowItWorks />
      <Privacy />
      <Faq />
      <RelatedPages
        links={[
          {
            href: STATUSLINE_PATH,
            title: "Usage meters in your statusline",
            description:
              "Put 5-hour and weekly usage, context left and session cost under Claude Code, or pick Codex's limit fields.",
          },
          {
            href: CLAUDE_ACCOUNTS_PATH,
            title: "Multiple Claude Code accounts",
            description:
              "Pin work and personal Claude accounts to separate projects, each with its own limits card.",
          },
          {
            href: PARALLEL_PATH,
            title: "Run Claude Code in parallel",
            description:
              "Fan one task out to several Claude Code agents in project copies and keep the best result.",
          },
          {
            href: AUTOMATIONS_PATH,
            title: "Schedule Claude Code tasks",
            description:
              "Put Claude Code and Codex prompts on a schedule and read each run's answer when it finishes.",
          },
          {
            href: MOBILE_PATH,
            title: "Usage and Stats on your iPhone",
            description:
              "Check limits, token totals and your agents from the lpm iPhone app.",
          },
          {
            href: FEATURES_PATH,
            title: "Everything lpm does",
            description:
              "Projects, services, terminals, agents, review, automations and remote machines in one list.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
