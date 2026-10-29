import type { Metadata } from "next";
import CheckUsage from "@/app/claude-code-codex-token-usage/_components/check-usage";
import Faq from "@/app/claude-code-codex-token-usage/_components/faq";
import { RelatedPages } from "@/components/related-pages";
import {
  CLAUDE_ACCOUNTS_PATH,
  LIMIT_CALCULATOR_PATH,
  STATUSLINE_PATH,
  TOKEN_USAGE_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdString,
  webPageJsonLd,
} from "@/lib/structured-data";
import CalculatorSection from "./_components/calculator-section";
import Cta from "./_components/cta";
import { FAQ_ITEMS } from "./_components/faq-data";
import Hero from "./_components/hero";
import LimitsSection from "./_components/limits-section";

const TITLE = "Claude Code Limit Calculator: 5-Hour and Weekly Pace";
const DESCRIPTION =
  "Will you hit your Claude Code limit before it resets? Enter your 5-hour or weekly usage and the time elapsed to see your pace and when you'll run out. Works for Codex.";
const SHARE_TITLE = "Will you hit your Claude Code limit before it resets?";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "Claude Code limit calculator",
    "Claude Code usage limit",
    "Claude Code 5-hour limit",
    "Claude Code weekly limit",
    "Claude Code limit reset",
    "Codex usage limit",
    "Codex rate limit",
  ],
  alternates: {
    canonical: LIMIT_CALCULATOR_PATH,
  },
  openGraph: {
    title: SHARE_TITLE,
    description: DESCRIPTION,
    type: "website",
    url: LIMIT_CALCULATOR_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: DESCRIPTION,
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: LIMIT_CALCULATOR_PATH,
    about: [
      "Claude Code usage limits",
      "Claude Code 5-hour limit",
      "Claude Code weekly limit",
      "Codex rate limits",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Claude Code Limit Calculator", path: LIMIT_CALCULATOR_PATH },
  ]),
  faqJsonLd(FAQ_ITEMS),
];

export default function ClaudeCodeLimitCalculatorPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <CalculatorSection />
      <CheckUsage />
      <LimitsSection />
      <Faq items={FAQ_ITEMS} title="Claude Code limits, answered" />
      <RelatedPages
        links={[
          {
            href: TOKEN_USAGE_PATH,
            title: "Claude Code & Codex usage tracker",
            description:
              "Tokens by project and session, estimated cost, and live 5-hour and weekly meters with this same pace verdict.",
          },
          {
            href: CLAUDE_ACCOUNTS_PATH,
            title: "Multiple Claude Code accounts",
            description:
              "Give each project its own Claude account, and move new sessions to one with room when an account runs low.",
          },
          {
            href: STATUSLINE_PATH,
            title: "Usage in your Claude Code statusline",
            description:
              "Keep 5-hour and weekly usage under every Claude Code prompt, or pick Codex's limit fields.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
