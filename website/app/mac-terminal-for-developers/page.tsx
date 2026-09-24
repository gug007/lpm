import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  BEST_TERMINAL_MAC_PATH,
  FEATURES_PATH,
  GIT_TERMINAL_MAC_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  PROJECT_SIDEBAR_PATH,
  SSH_TERMINAL_MAC_PATH,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";
import Benefits from "./_components/benefits";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Problem from "./_components/problem";
import Workflows from "./_components/workflows";
import { STACK_DEMO } from "./_components/demo-tour";

const TITLE = "Mac Terminal for Developers Running Full Stacks";
const DESCRIPTION =
  "A Mac terminal for developers who run full stacks: services detected from your repo, a log pane for each, and project switching that keeps everything running.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "mac terminal app",
    "mac terminal for developers",
    "terminal for mac developers",
    "developer terminal mac",
    "mac terminal for web developers",
    "run multiple services mac terminal",
    "mac dev environment terminal",
  ],
  alternates: {
    canonical: MAC_TERMINAL_DEVELOPERS_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: MAC_TERMINAL_DEVELOPERS_PATH,
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
    path: MAC_TERMINAL_DEVELOPERS_PATH,
    about: [
      "Mac terminal for developers",
      "run multiple dev services on Mac",
      "monorepo dev servers",
      "per-service log panes",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Mac Terminal for Developers", path: MAC_TERMINAL_DEVELOPERS_PATH },
  ]),
];

export default function MacTerminalForDevelopersPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <DemoSection {...STACK_DEMO} />
      <Problem />
      <Features />
      <Benefits />
      <Workflows />
      <Comparison />
      <Faq />
      <RelatedPages
        links={[
          {
            href: BEST_TERMINAL_MAC_PATH,
            title: "Best terminal for Mac",
            description:
              "Split panes, themes, and search, plus why a native Apple Silicon app beats Electron terminals.",
          },
          {
            href: GIT_TERMINAL_MAC_PATH,
            title: "Git terminal for Mac",
            description:
              "Branch, commit, and open pull requests while your dev servers keep streaming.",
          },
          {
            href: SSH_TERMINAL_MAC_PATH,
            title: "SSH terminal for Mac",
            description:
              "Remote dev boxes with forwarded ports, in the same sidebar as your local projects.",
          },
          {
            href: PROJECT_SIDEBAR_PATH,
            title: "Terminal with a project sidebar",
            description:
              "How the project list works up close: folders, copies, running dots, and agent attention states.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code and Codex",
            description:
              "Agents beside your services, with live status and alerts when one needs you.",
          },
          {
            href: FEATURES_PATH,
            title: "Every lpm feature",
            description:
              "The full tour: services, terminals, agents, git, automations, and the iPhone app.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
