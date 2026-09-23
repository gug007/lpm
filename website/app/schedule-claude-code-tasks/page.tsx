import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AUTOMATIONS_PATH,
  CONNECT_AGENTS_PATH,
  FEATURES_PATH,
  MOBILE_PATH,
  PARALLEL_PATH,
  TOKEN_USAGE_PATH,
  WORKTREE_AGENTS_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  webPageJsonLd,
} from "@/lib/structured-data";
import AutomationsPreview from "./_components/automations-preview";
import Cta from "./_components/cta";
import Examples from "./_components/examples";
import Faq from "./_components/faq";
import Guardrails from "./_components/guardrails";
import Hero from "./_components/hero";
import HowItWorks from "./_components/how-it-works";
import JobKinds from "./_components/job-kinds";
import Limits from "./_components/limits";
import RunHistory from "./_components/run-history";
import Schedules from "./_components/schedules";
import StayInLoop from "./_components/stay-in-loop";

const TITLE = "Schedule Claude Code Tasks & Codex Runs on Your Mac";
const DESCRIPTION =
  "Run Claude Code and Codex on a schedule: nightly, on weekdays or every few hours, in a fresh copy or Git worktree, with results you can read and reply to.";
const SOCIAL_DESCRIPTION =
  "Schedule Claude Code, Codex, Gemini CLI or OpenCode to run nightly, on weekdays or every few hours, and read each answer when you're back.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "schedule Claude Code tasks",
    "Claude Code cron job",
    "run Claude Code overnight",
    "schedule Codex tasks",
    "Claude Code scheduled tasks",
    "automate Claude Code",
    "Codex cron",
    "scheduled AI coding agent Mac",
  ],
  alternates: {
    canonical: AUTOMATIONS_PATH,
  },
  openGraph: {
    title: TITLE,
    description: SOCIAL_DESCRIPTION,
    type: "website",
    url: AUTOMATIONS_PATH,
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
    path: AUTOMATIONS_PATH,
    about: [
      "schedule Claude Code tasks",
      "Claude Code cron job",
      "run Claude Code overnight",
      "scheduled Codex runs",
      "AI coding agent automations",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Schedule Claude Code Tasks", path: AUTOMATIONS_PATH },
  ]),
];

export default function ScheduleClaudeCodeTasksPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <AutomationsPreview />
      <HowItWorks />
      <JobKinds />
      <Schedules />
      <Examples />
      <Guardrails />
      <RunHistory />
      <StayInLoop />
      <Limits />
      <Faq />
      <RelatedPages
        links={[
          {
            href: PARALLEL_PATH,
            title: "Run Claude Code in parallel",
            description:
              "When one scheduled run is not enough, fan the same prompt out across project copies and compare the results.",
          },
          {
            href: WORKTREE_AGENTS_PATH,
            title: "Git worktrees for AI agents",
            description:
              "When to give an agent a linked worktree and when a full copy of the project works better.",
          },
          {
            href: MOBILE_PATH,
            title: "lpm link for iPhone",
            description:
              "Check on agents and automations, get push notifications, and reply from your phone.",
          },
          {
            href: TOKEN_USAGE_PATH,
            title: "Claude Code & Codex token usage",
            description:
              "See where the tokens went, by project, model and session, on your Mac.",
          },
          {
            href: CONNECT_AGENTS_PATH,
            title: "Connect agents to lpm",
            description:
              "Give Claude Code and Codex the lpm CLI and skills to start services and read logs.",
          },
          {
            href: FEATURES_PATH,
            title: "Everything lpm does",
            description:
              "Projects, services, terminals, agents, review and automations, all in one Mac app.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
