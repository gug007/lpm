import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  AUTOMATIONS_PATH,
  CONFIG_PATH,
  CONNECT_AGENTS_PATH,
  LINUX_HOST_PATH,
  PARALLEL_PATH,
  SKILLS_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  screenRecordingJsonLd,
  webPageJsonLd,
} from "@/lib/structured-data";
import Commands from "./_components/commands";
import Cta from "./_components/cta";
import Demos from "./_components/demos";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Install from "./_components/install";
import Memory from "./_components/memory";
import Parallel from "./_components/parallel";
import Workflows from "./_components/workflows";

const TITLE = "Let Claude Code and Codex Run Your Dev Environment";
const DESCRIPTION =
  "Give Claude Code, Codex, Gemini CLI, and OpenCode a CLI to run your project: start dev servers, read logs, wait for ports, and fan out into parallel copies.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "claude code tools",
    "let claude code run dev server",
    "codex skills",
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
      "One click gives Claude Code, Codex, Gemini CLI, and OpenCode a CLI to start, stop, and restart your services, read dev-server logs, wait for ports, fan out into parallel copies, and share session memory.",
    type: "website",
    url: CONNECT_AGENTS_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Give your AI coding agents a CLI to run your dev environment: start, stop, and restart services, read logs, and fan out into parallel copies.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: CONNECT_AGENTS_PATH,
    about: [
      "connect AI coding agents to a dev environment",
      "CLI for Claude Code and Codex",
      "shared memory between AI coding agents",
      "parallel AI coding agents",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    {
      name: "Let Claude Code and Codex Run Your Dev Environment",
      path: CONNECT_AGENTS_PATH,
    },
  ]),
  screenRecordingJsonLd("agent-run-command"),
  screenRecordingJsonLd("agent-parallel-tabs"),
  screenRecordingJsonLd("agent-duplicate-fanout"),
];

export default function ConnectAiAgentsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <Install />
      <Features />
      <Commands />
      <Demos />
      <Workflows />
      <Parallel />
      <Memory />
      <Faq />
      <RelatedPages
        links={[
          {
            href: SKILLS_PATH,
            title: "Claude Code & Codex skills",
            description:
              "See every skill, MCP server, and hook an agent loads, and write your own skills in a form.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code and Codex",
            description:
              "Which Claude Code or Codex session is working, which needs you, and how much plan is left, from the sidebar.",
          },
          {
            href: PARALLEL_PATH,
            title: "Run Claude Code in parallel",
            description:
              "One prompt, several copies of the project, and the best answer kept.",
          },
          {
            href: AUTOMATIONS_PATH,
            title: "Schedule Claude Code tasks",
            description:
              "Put agent prompts on a timer, working in place or in a separate copy you review afterwards.",
          },
          {
            href: CONFIG_PATH,
            title: "Configuration reference",
            description:
              "Every project config field agents can write: services, actions, terminals, and profiles.",
          },
          {
            href: LINUX_HOST_PATH,
            title: "Run Claude Code on a remote server",
            description:
              "The same skills and CLI on a Linux box you own, so a long agent run outlives your laptop.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
