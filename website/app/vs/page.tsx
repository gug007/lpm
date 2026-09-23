import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/config/code-block";
import { RelatedPages } from "@/components/related-pages";
import { ComparisonBasis } from "@/components/vs/comparison-basis";
import { Cta } from "@/components/vs/cta";
import { Faq } from "@/components/vs/faq";
import { QuickAnswer } from "@/components/vs/quick-answer";
import { VS_REVIEWED, VS_REVIEWED_ISO } from "@/components/vs/reviewed";
import { SectionVideo } from "@/components/vs/section-video";
import {
  AI_AGENTS_PATH,
  BEST_TERMINAL_MAC_PATH,
  CONFIG_PATH,
  LINUX_HOST_PATH,
  SSH_TERMINAL_MAC_PATH,
  VS_BASE_PATH,
  WORKTREE_AGENTS_PATH,
  vsPath,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  itemListJsonLd,
  jsonLdString,
  screenRecordingJsonLd,
  webPageJsonLd,
} from "@/lib/structured-data";
import Hero from "./_components/hero";
import { HUB_FAQ, HUB_SOURCES } from "./_components/hub-data";
import Router from "./_components/router";
import ToolMatrix from "./_components/tool-matrix";

const TITLE = "Run a Mac Dev Stack: tmux vs PM2 vs Docker Compose";
const DESCRIPTION =
  "tmux, iTerm2, cmux, Docker Compose, Foreman, Overmind, PM2 — compared for Mac local dev and for running Claude Code and Codex beside your services.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "tmux vs pm2 vs docker compose",
    "tmux vs docker compose local dev",
    "foreman vs overmind",
    "pm2 vs docker compose development",
    "best way to run local dev stack mac",
    "run multiple services locally mac",
    "local dev stack manager mac",
    "procfile runner alternative",
    "terminal multiplexer vs procfile runner",
    "run claude code and codex beside dev servers",
  ],
  alternates: { canonical: VS_BASE_PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: VS_BASE_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const SHAPES = `Procfile        web: bin/rails server
                css: bin/rails tailwindcss:watch

compose.yaml    services:
                  web: { command: bin/rails server }

.lpm.yml        services:
                  web: bin/rails server
                  css: bin/rails tailwindcss:watch`;

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: VS_BASE_PATH,
    about: [
      "local development on macOS",
      "tmux alternatives",
      "Procfile runners",
      "Docker Compose for local development",
      "running Claude Code and Codex locally",
    ],
    dateModified: VS_REVIEWED_ISO,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Compare", path: VS_BASE_PATH },
  ]),
  itemListJsonLd([
    {
      name: "lpm vs iTerm2",
      path: vsPath("iterm2"),
      description:
        "Terminal tabs and profiles against starting the whole project at once.",
    },
    {
      name: "lpm vs tmux",
      path: vsPath("tmux"),
      description:
        "Panes without a .tmux.conf, and what tmux still does that lpm does not.",
    },
    {
      name: "lpm vs cmux",
      path: vsPath("cmux"),
      description:
        "Two Mac apps built for coding agents, compared row by row.",
    },
    {
      name: "lpm vs Docker Compose",
      path: vsPath("docker-compose"),
      description:
        "Native processes against containers for the local inner loop.",
    },
    {
      name: "lpm vs Foreman",
      path: vsPath("foreman"),
      description:
        "A Procfile formation against a project you start, stop and duplicate.",
    },
    {
      name: "lpm vs Overmind",
      path: vsPath("overmind"),
      description:
        "Procfile-shaped control from a Mac app, with no tmux to install underneath it.",
    },
    {
      name: "lpm vs PM2",
      path: vsPath("pm2"),
      description:
        "A production supervisor next to a workflow built for the dev loop.",
    },
  ]),
  screenRecordingJsonLd("start-project"),
];

export default function ComparisonsHubPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />

      <QuickAnswer question="What should run a multi-process dev stack on a Mac?">
        <p>
          It depends on how many processes there are and how often you restart
          them. One process: any terminal. Four processes you restart all day:
          you want one command that starts them all and one pane per process —
          that is what tmux, Foreman, Overmind, Docker Compose and PM2 each do
          differently. Several repos at once, or a coding agent working beside
          the services: you want the project itself to be the thing you start
          and stop.
        </p>
        <p>
          The five families, one line each.{" "}
          <strong className="font-semibold text-gray-900 dark:text-gray-100">
            Terminal emulators
          </strong>{" "}
          (iTerm2, cmux) give you panes and leave the wiring to you.{" "}
          <strong className="font-semibold text-gray-900 dark:text-gray-100">
            Multiplexers
          </strong>{" "}
          (tmux) make those panes survive a disconnect.{" "}
          <strong className="font-semibold text-gray-900 dark:text-gray-100">
            Procfile runners
          </strong>{" "}
          (Foreman, Overmind) start a fixed list of named processes with one
          command.{" "}
          <strong className="font-semibold text-gray-900 dark:text-gray-100">
            Container stacks
          </strong>{" "}
          (Docker Compose) also build the environment those processes run in.{" "}
          <strong className="font-semibold text-gray-900 dark:text-gray-100">
            Supervisors
          </strong>{" "}
          (PM2) keep processes alive and restart them when they die. lpm is a
          shape of its own: the project is the object — start it, stop it,
          duplicate it, and give Claude Code or Codex a tab of its own next to
          the services.
        </p>
        <p>
          Foreman and Overmind run straight off a Procfile you already have,
          Docker Compose off a compose file, and all three read it again on
          every start. lpm uses either one once, when you add the folder — a
          service per Procfile line, or a single <code>docker compose up</code>{" "}
          for the compose file — and keeps a list of its own after that. Five of
          the seven also run somewhere other than a Mac; lpm does not, and the
          table below says so.
        </p>
        <CodeBlock filename="The same two processes, three ways">
          {SHAPES}
        </CodeBlock>
        <p>
          The shapes barely differ — a name and a command. What differs is what
          happens after they are running. For the lpm side of it, see{" "}
          <Link
            href={CONFIG_PATH}
            className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
          >
            the full field list
          </Link>
          .
        </p>
      </QuickAnswer>

      <ToolMatrix
        footnote={
          <>
            <span className="block">
              The lpm column covers the app and its <code>lpm</code> command
              together. Anything that changes what is running — starting,
              stopping, restarting — is the app&apos;s job, and the command hands
              it over, so keep lpm open for those; reading what is already
              running (<code>lpm list</code>, <code>lpm logs</code>) works
              either way.
            </span>
            <span className="mt-3 block">
              lpm&apos;s desktop app is macOS only. A Linux box can take the
              other end of it — the services and the agents run there, the Mac
              drives them —{" "}
              <Link
                href={LINUX_HOST_PATH}
                className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
              >
                see the guide
              </Link>
              .
            </span>
            <span className="mt-3 block">
              Duplicating a project gives each agent its own checkout, so two of
              them never save over each other&apos;s work; the ports and the
              database underneath stay shared, and lpm checks the ports a
              project declares before it starts and names whatever process is
              holding one. A worktree copy brings across only the files git
              tracks — no <code>.env</code>, and Node packages only if you ask
              lpm to install them —{" "}
              <Link
                href={WORKTREE_AGENTS_PATH}
                className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
              >
                here is what else it leaves behind
              </Link>
              .
            </span>
          </>
        }
      />

      <ComparisonBasis
        reviewed={VS_REVIEWED}
        reviewedIso={VS_REVIEWED_ISO}
        sources={HUB_SOURCES}
        lpmNote="Where we cannot name a workflow difference we do not invent one — two rows above go against lpm."
      />

      <Router />

      <SectionVideo
        eyebrow="One command"
        title="Every service up, one live pane each"
        description="The row every tool in the table implements differently: what starting the whole stack looks like when the project is the thing you start."
        clip="start-project"
        label="Starting a project in lpm — every service comes up at once, each in its own live pane."
      />

      <Faq title="Questions before you pick one" items={HUB_FAQ} />

      <RelatedPages
        links={[
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "The agent half of this table: a tab per agent, its status, and the services still running underneath.",
          },
          {
            href: BEST_TERMINAL_MAC_PATH,
            title: "Best terminal for Mac",
            description:
              "Where lpm's own terminal lands next to iTerm2, Terminal.app, Hyper and Warp.",
          },
          {
            href: SSH_TERMINAL_MAC_PATH,
            title: "SSH terminal for Mac",
            description:
              "Reach a machine over SSH and keep it in the sidebar beside your local projects.",
          },
          {
            href: CONFIG_PATH,
            title: "Configuration reference",
            description:
              "Every key a service, profile or action accepts, and which file each one belongs in.",
          },
          {
            href: WORKTREE_AGENTS_PATH,
            title: "Git worktrees for AI agents",
            description:
              "What a second checkout gives an agent, and what it quietly leaves behind.",
          },
          {
            href: LINUX_HOST_PATH,
            title: "Run Claude Code on a remote server",
            description:
              "Driving a headless Linux host from the Mac — the only Linux in the table lpm has a story for.",
          },
        ]}
      />

      <Cta
        title="Keep the tool that already works. Let lpm start the project."
        description="Free, open source, native macOS app. No lock-in — lpm starts and stops native processes the same way you would."
        downloadSource="vs-hub-cta"
      />
    </>
  );
}
