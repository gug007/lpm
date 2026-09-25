import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  AUTOMATIONS_PATH,
  CLAUDE_ACCOUNTS_PATH,
  MOBILE_PATH,
  PARALLEL_PATH,
  STATUSLINE_PATH,
  TOKEN_USAGE_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdString,
  webPageJsonLd,
} from "@/lib/structured-data";
import CheckUsage from "./_components/check-usage";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import FactsChecked from "./_components/facts-checked";
import Faq from "./_components/faq";
import { FAQ_ITEMS } from "./_components/faq-data";
import Hero from "./_components/hero";
import LimitsSection from "./_components/limits-section";
import MidCta from "./_components/mid-cta";
import NumbersFlow from "./_components/numbers-flow";
import ResetSection from "./_components/reset-section";
import StatsSection from "./_components/stats-section";

const TITLE = "Claude Code & Codex Usage Tracker: Tokens & Limits";
const DESCRIPTION =
  "Track Claude Code and Codex usage in a free Mac app: tokens by project, estimated cost, 5-hour and weekly limits with pace, and a prompt sent at reset.";
const SHARE_TITLE = "Where did your Claude Code and Codex tokens go?";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "Claude Code usage tracker",
    "Codex usage tracker",
    "Claude Code token usage",
    "Codex token usage",
    "check Claude Code usage",
    "Claude Code /usage",
    "Codex /status",
    "Claude Code 5-hour limit",
    "Claude Code weekly limit",
    "Codex usage limit",
    "Codex rate limit",
    "Claude Code usage limit reached",
    "Claude Code token usage by project",
    "Claude Code cost tracker",
    "ccusage alternative",
    "Claude Max usage tracker",
  ],
  alternates: {
    canonical: TOKEN_USAGE_PATH,
  },
  openGraph: {
    title: SHARE_TITLE,
    description:
      "Tokens by project and session, live 5-hour and weekly limits with a pace verdict, and a prompt that waits for the reset. Free and open source.",
    type: "website",
    url: TOKEN_USAGE_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description:
      "See Claude Code and Codex tokens by project and your 5-hour and weekly limits with pace. Queue the next prompt for the reset. Free Mac app.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: TOKEN_USAGE_PATH,
    about: [
      "Claude Code usage tracker",
      "Codex usage tracker",
      "Claude Code token usage",
      "Codex token usage",
      "Claude Code 5-hour and weekly limits",
      "Codex rate limits",
      "token usage by project",
      "sending a prompt when a usage limit resets",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Claude Code & Codex Usage Tracker", path: TOKEN_USAGE_PATH },
  ]),
  faqJsonLd(FAQ_ITEMS),
];

export default function ClaudeCodeCodexTokenUsagePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <CheckUsage />
      <LimitsSection />
      <ResetSection />
      <MidCta />
      <StatsSection />
      <NumbersFlow />
      <Comparison />
      <FactsChecked />
      <Faq />
      <RelatedPages
        links={[
          {
            href: STATUSLINE_PATH,
            title: "Usage in your Claude Code or Codex statusline",
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
            href: AUTOMATIONS_PATH,
            title: "Schedule Claude Code tasks",
            description:
              "Run Claude Code and Codex prompts on a schedule and read each run's answer when it finishes.",
          },
          {
            href: PARALLEL_PATH,
            title: "Run Claude Code in parallel",
            description:
              "Parallel agents draw on the same plan. Fan one task out to project copies and keep the best result.",
          },
          {
            href: MOBILE_PATH,
            title: "Usage and Stats on your iPhone",
            description:
              "Check limits and token totals from the lpm iPhone app, straight from your Mac.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code and Codex",
            description:
              "Run both agents next to your dev servers, with live status, notifications and a prompt composer.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
