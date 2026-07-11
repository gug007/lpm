import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  CLAUDE_ACCOUNTS_PATH,
  CONFIG_PATH,
  CONNECT_AGENTS_PATH,
} from "@/lib/links";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/structured-data";
import Commands from "./_components/commands";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Install from "./_components/install";
import Parallel from "./_components/parallel";
import Workflows from "./_components/workflows";

const TITLE = "Connect AI Coding Agents to Your Dev Environment";
const DESCRIPTION =
  "Give Claude Code, Codex, Gemini CLI, and OpenCode a CLI to run your project — start, stop, and restart dev servers, read logs, wait for ports, report status, and fan out into parallel copies. One-click skill and CLI install for your Mac.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "connect ai agents to dev environment",
    "let claude code restart my dev server",
    "claude code agent skills",
    "cli for ai coding agents",
    "run ai agents in parallel on copies of a project",
    "codex cli tools",
    "gemini cli agent skills",
    "ai coding agent dev server control",
  ],
  alternates: {
    canonical: CONNECT_AGENTS_PATH,
  },
  openGraph: {
    title: TITLE,
    description:
      "One click gives Claude Code, Codex, Gemini CLI, and OpenCode a CLI to start, stop, and restart your services, read dev-server logs, wait for ports, and fan out into parallel copies of a project.",
    type: "website",
    url: CONNECT_AGENTS_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Give your AI coding agents a CLI to run your dev environment — start, stop, restart services, read logs, and fan out into parallel copies.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: CONNECT_AGENTS_PATH,
    about: [
      "connect AI coding agents to a dev environment",
      "Claude Code agent skills",
      "CLI for AI coding agents",
      "parallel AI coding agents",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    {
      name: "Connect AI Coding Agents to Your Dev Environment",
      path: CONNECT_AGENTS_PATH,
    },
  ]),
];

export default function ConnectAiAgentsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Hero />
      <Install />
      <Features />
      <Commands />
      <Workflows />
      <Parallel />
      <Faq />
      <RelatedPages
        links={[
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "The native macOS workspace for running AI coding agents in parallel, with your dev stack in view.",
          },
          {
            href: CLAUDE_ACCOUNTS_PATH,
            title: "Multiple Claude Code accounts",
            description:
              "Pin a Claude account to each project — work and personal run in parallel, signed in once.",
          },
          {
            href: CONFIG_PATH,
            title: "Configuration reference",
            description:
              "Every project config field agents can write — services, actions, terminals, and profiles.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
