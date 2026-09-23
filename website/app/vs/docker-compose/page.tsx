import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/config/code-block";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import { ComparisonBasis } from "@/components/vs/comparison-basis";
import { ComparisonHero } from "@/components/vs/comparison-hero";
import { Cta } from "@/components/vs/cta";
import { Faq, type FaqItem } from "@/components/vs/faq";
import { QuickAnswer } from "@/components/vs/quick-answer";
import { VS_REVIEWED, VS_REVIEWED_ISO } from "@/components/vs/reviewed";
import { SectionVideo } from "@/components/vs/section-video";
import { VerdictCards, type VerdictCard } from "@/components/vs/verdict-cards";
import { WhenToPick } from "@/components/vs/when-to-pick";
import {
  AI_AGENTS_PATH,
  CONFIG_PATH,
  LINUX_HOST_PATH,
  PROJECT_SIDEBAR_PATH,
  VS_BASE_PATH,
  vsPath,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  screenRecordingJsonLd,
  webPageJsonLd,
} from "@/lib/structured-data";
import { ComposeMap } from "./_components/compose-map";
import { ComposeMatrix } from "./_components/compose-matrix";
import { SplitStack } from "./_components/split-stack";

const PATH = vsPath("docker-compose");

const TITLE = "Docker Compose Alternative for Local Dev on macOS";
const DESCRIPTION =
  "A Docker Compose alternative for the daily loop: run your stack natively on macOS, a pane per service, and keep compose for the containers that earn it.";

const CODE = "font-mono text-[0.9em]";
const LINK =
  "underline underline-offset-2 hover:text-gray-900 dark:hover:text-white";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "docker compose alternative for dev",
    "docker compose alternative mac",
    "docker compose slow mac",
    "docker compose vs lpm",
    "run dev stack without docker",
    "local development without docker desktop",
    "native local development macos",
    "docker compose local dev",
    "docker compose profiles alternative",
    "do i need docker desktop",
    "run claude code without docker",
  ],
  alternates: { canonical: PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const YAML = `services:
  compose: docker compose up
  api:
    cmd: bin/rails s
    port: 3000
    dependsOn: [compose]
  web:
    cmd: npm run dev
    port: 5173
    dependsOn: [api]

profiles:
  backend: [compose, api]`;

const SOURCES = [
  {
    href: "https://docs.docker.com/reference/cli/docker/compose/",
    label: "the Compose CLI reference",
  },
  {
    href: "https://docs.docker.com/reference/compose-file/services/",
    label: "the Compose file services reference",
  },
  {
    href: "https://docs.docker.com/desktop/settings-and-maintenance/settings/#file-sharing",
    label: "Docker Desktop's VM and file-sharing settings",
  },
  {
    href: "https://docs.docker.com/compose/how-tos/file-watch/",
    label: "Compose file watch",
  },
  {
    href: "https://docs.docker.com/desktop/use-desktop/container/",
    label: "the Docker Desktop containers view",
  },
  {
    href: "https://docs.docker.com/subscription-billing/desktop-license/",
    label: "Docker Desktop pricing",
  },
  {
    href: "https://github.com/docker/compose/blob/main/LICENSE",
    label: "the Compose licence",
  },
];

const VERDICT_CARDS: [VerdictCard, VerdictCard, VerdictCard] = [
  {
    label: "lpm",
    title: "Run it natively",
    body: "Each process gets its own pane. No image, no volume, no container to create — dependsOn for order, profiles for subsets.",
  },
  {
    label: "Both",
    title: "Drive compose from lpm",
    body: "Keep Postgres, Redis or Kafka in containers. Adding the folder already makes docker compose up one lpm service, its output in a pane beside your native ones.",
  },
  {
    label: "Docker Compose",
    title: "Keep compose",
    body: "Prod parity down to the image tag, a teammate whose laptop is not a Mac, or an image there is no native way to install. Five rows in the table go to Compose, and the description names them.",
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Can I use lpm and Docker Compose together?",
    answer: (
      <>
        Yes, and this is the common case. lpm runs compose up as one of your
        services alongside native processes, and lists it that way on its own
        when the folder has a compose file. So you can keep Postgres and Redis
        in containers for prod parity while running your Rails or Next.js app
        natively, and watch every pane — container logs included — in the same
        desktop app. They are not mutually exclusive. Use the attached form —{" "}
        <code className={CODE}>docker compose up</code>, not{" "}
        <code className={`${CODE} whitespace-nowrap`}>-d</code>{" "}
        — if you want the container output in an lpm pane; a detached start hands
        you nothing to watch.
      </>
    ),
    answerText:
      "Yes, and this is the common case. lpm runs compose up as one of your services alongside native processes, and lists it that way on its own when the folder has a compose file. So you can keep Postgres and Redis in containers for prod parity while running your Rails or Next.js app natively, and watch every pane — container logs included — in the same desktop app. They are not mutually exclusive. Use the attached form — docker compose up, not -d — if you want the container output in an lpm pane; a detached start hands you nothing to watch.",
  },
  {
    question: "Does lpm replace Docker Compose?",
    answer:
      "For some workflows, yes; for others, no. If you're a solo or small-team dev doing native work on macOS and Compose was mostly a way to launch a process tree, lpm covers that with per-service panes and multi-project switching. If you rely on Compose for prod-parity service versions, cross-OS team reproducibility, or container-first deploy pipelines, keep using Compose. lpm doesn't try to be a container runtime.",
  },
  {
    question: "Why is Docker Compose slow on a Mac?",
    answer:
      "Your containers run in a Linux VM and your source is shared into it. VirtioFS narrowed that gap a lot and it is the default now, but the shared path still sits between your file watcher and your disk, and every start has to create and start containers rather than just a process. Native processes read the disk directly.",
  },
  {
    question: "Can lpm read my docker-compose.yml?",
    answer: (
      <>
        Partly. When you add the folder, lpm notices{" "}
        <code className={CODE}>docker-compose.yml</code>{" "}
        (or <code className={CODE}>compose.yaml</code>) and lists{" "}
        <code className={CODE}>compose: docker compose up</code>{" "}
        as one service — the attached form, so the container output has a pane
        — next to the native services it found in the same pass. It does not
        parse the compose service graph. To split the infrastructure further,
        edit the list, or press Generate with AI in the config editor for a
        second draft from Claude Code, Codex, Gemini CLI or OpenCode.
      </>
    ),
    answerText:
      "Partly. When you add the folder, lpm notices docker-compose.yml (or compose.yaml) and lists compose: docker compose up as one service — the attached form, so the container output has a pane — next to the native services it found in the same pass. It does not parse the compose service graph. To split the infrastructure further, edit the list, or press Generate with AI in the config editor for a second draft from Claude Code, Codex, Gemini CLI or OpenCode.",
  },
  {
    question: "Two projects need port 5432 — what happens without containers?",
    answer:
      "One of them loses, and lpm tells you before it starts: it checks each declared port, names the process holding it, and either asks, frees it, or refuses to start depending on that service's portConflict setting. That is detection, not isolation. If you genuinely need both at once, that is a container's job.",
  },
  {
    question: "Does lpm run on Linux or Windows?",
    answer: (
      <>
        There is no Windows build, and no Linux desktop build either — the app
        itself is macOS only. A Linux machine can still be{" "}
        <Link href={LINUX_HOST_PATH} className={LINK}>
          the host that runs your services and agent sessions
        </Link>
        , with the Mac window driving all of it.
      </>
    ),
    answerText:
      "There is no Windows build, and no Linux desktop build either — the app itself is macOS only. A Linux machine can still be the host that runs your services and agent sessions, with the Mac window driving all of it.",
  },
];

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: PATH,
    about: [
      "Docker Compose alternatives for local development",
      "running a dev stack natively on macOS",
      "Docker Compose performance on macOS",
      "driving docker compose from lpm",
    ],
    dateModified: VS_REVIEWED_ISO,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Compare", path: VS_BASE_PATH },
    { name: "Docker Compose", path: PATH },
  ]),
  screenRecordingJsonLd("run-profile-project"),
];

export default function LpmVsDockerComposePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <ComparisonHero
        eyebrow="lpm vs Docker Compose"
        title="A Docker Compose alternative for fast local dev on macOS."
        description="Compose gives every machine the same stack, at the cost of a Linux VM, a shared filesystem and a container to create before anything runs. lpm reads the repo, lists the same processes, and runs them straight on the host, one live pane each."
        verdictLine="Most people end up splitting it: app code native, stateful infrastructure still in compose."
        jumpHref="#map"
        jumpLabel="See every compose command mapped"
        downloadSource="vs-compose-hero"
      />

      <ComparisonBasis
        reviewed={VS_REVIEWED}
        reviewedIso={VS_REVIEWED_ISO}
        sources={SOURCES}
        lpmNote="The file-sharing and rebuild rows were re-checked against Docker's current defaults, not the osxfs era; every lpm cell was re-read in the app source on the same date, after lpm began listing compose files as a service."
      />

      <QuickAnswer question="Can you run a dev stack on macOS without Docker Compose?">
        <p>
          Yes — for every service your Mac can run directly. Add the folder and
          lpm lists the processes it recognises — Rails, Django, a Next.js or Vite
          dev server, Go, and the compose file itself — then starts them
          together, each in its own live pane, with{" "}
          <code className={CODE}>dependsOn</code>{" "}
          for start order and <code className={CODE}>profiles</code>{" "}
          for subsets of the stack.
        </p>
        <p>
          What you give up is the container boundary: no pinned image versions,
          no separate network namespace, and no guarantee that a teammate on
          Linux gets an identical stack. Which is why most people end up
          splitting it — application code native, stateful infrastructure still
          in compose, both started from the same window.
        </p>
        <CodeBlock filename=".lpm.yml">{YAML}</CodeBlock>
        <p>
          Commit it at the repo root and a teammate who clones gets the same
          graph. lpm still adds what it detects when they add the folder, so
          they may find a double to delete. Keep the attached form —{" "}
          <code className={CODE}>docker compose up</code>, not{" "}
          <code className={`${CODE} whitespace-nowrap`}>-d</code>{" "}
          — if you want the container output in an lpm pane. The config reference
          documents{" "}
          <Link href={CONFIG_PATH} className={LINK}>
            every field
          </Link>
          .
        </p>
      </QuickAnswer>

      <VerdictCards cards={VERDICT_CARDS} />

      <ComposeMap />

      <ComposeMatrix />

      <SplitStack />

      <SectionVideo
        eyebrow="See it"
        title="A subset of the stack, on demand"
        description="Compose profiles have a direct equivalent: named subsets you switch between from the header."
        clip="run-profile-project"
        label="Switching between profiles in lpm to run a subset of a project's services."
      />

      <WhenToPick
        title="When to keep compose, and when to go native"
        description="A friendly split. If your daily loop is native code running on your laptop, lpm leans in. If your daily loop depends on containerized infra matching prod, Compose still wins."
        lpm={{
          name: "lpm",
          headline:
            "Most of your stack runs fine as a host process, and you want to see each one.",
          points: [
            "You do most of your dev natively on macOS, and the file share into the VM still sits between your watcher and your disk.",
            "You want your Rails server, Next.js frontend, worker, and a Redis process each in their own live pane.",
            "You juggle several repos and would rather see which stack is up than remember which compose file you left running where.",
            "You run Claude Code, Codex, Gemini CLI, or OpenCode in parallel on the same or adjacent codebases and want their output beside your services — with Claude Code and Codex also reporting Working, Needs you or Done on the tab.",
            "You already have a docker-compose.yml — lpm can drive it as one service while you move the rest native.",
            "Your production is not containers at all — a managed platform, a VPS, or serverless — so the parity compose buys you was never real.",
          ],
        }}
        competitor={{
          name: "Docker Compose",
          headline:
            "You need prod parity, team reproducibility, or real container isolation for local dev.",
          points: [
            "Your production runs on containers and you want dev to match the exact Postgres, Redis, or Kafka versions.",
            "Your team spans multiple operating systems and reproducible local infra matters more than startup speed.",
            "You rely on complex service networking, named volumes, or health checks that Compose expresses cleanly.",
            "You want strong isolation — each service in its own container, its own filesystem, its own network namespace.",
            "Your CI, staging, and prod pipelines are container-based and your dev environment should stay in that ecosystem.",
            "A service nobody sensibly installs natively — Kafka, Elasticsearch, ClickHouse, SQL Server, LocalStack, or a vendor image with no Homebrew formula.",
            "Two projects need the same port at the same time; containers give each stack its own network namespace and lpm does not.",
          ],
        }}
      />

      <DemoSection />

      <Faq
        title="Switching from — or alongside — Docker Compose"
        items={FAQ_ITEMS}
      />

      <RelatedPages
        links={[
          {
            href: CONFIG_PATH,
            title: "The config file, field by field",
            description:
              "What port, portConflict, env, dependsOn and profiles each do inside a project file.",
          },
          {
            href: vsPath("pm2"),
            title: "lpm vs PM2 for local dev",
            description:
              "The supervisor question rather than the container one: what keeps a process alive after it dies.",
          },
          {
            href: vsPath("foreman"),
            title: "Foreman, Overmind and lpm",
            description:
              "Three ways to start the same handful of processes when the stack is Procfile lines, not images.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "A terminal for Claude Code and Codex",
            description:
              "Where Claude Code and Codex sit once the services are up, and what their tabs report while they work.",
          },
          {
            href: LINUX_HOST_PATH,
            title: "A Linux box as a headless host",
            description:
              "Put the services and the agents on a Linux machine and drive all of it from the Mac app.",
          },
          {
            href: PROJECT_SIDEBAR_PATH,
            title: "Every stack in one sidebar",
            description:
              "Which repos are up right now, which services each one is running, and one click to switch between them.",
          },
        ]}
      />

      <Cta
        title="Keep compose where it earns it. Run the rest on the host."
        description="Add the folder, get a live pane per service, and docker compose up as one of those services when a container is the right answer. Free, open source, native macOS app."
        downloadSource="vs-compose-cta"
      />
    </>
  );
}
