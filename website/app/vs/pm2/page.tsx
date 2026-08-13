import type { Metadata } from "next";
import Link from "next/link";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import { ComparisonBasis } from "@/components/vs/comparison-basis";
import { ComparisonHero } from "@/components/vs/comparison-hero";
import { Cta } from "@/components/vs/cta";
import { Faq, type FaqItem } from "@/components/vs/faq";
import {
  FeatureMatrix,
  type MatrixRow,
} from "@/components/vs/feature-matrix";
import { WhenToPick } from "@/components/vs/when-to-pick";
import {
  CONFIG_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  VS_BASE_PATH,
  vsPath,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";

const PATH = vsPath("pm2");

export const metadata: Metadata = {
  title: { absolute: "PM2 Alternative for Local Development — lpm vs PM2" },
  description:
    "PM2 is a production-first daemon with local watch mode. Compare it with lpm's Mac workspace, per-service panes, project switching, and agent copies.",
  keywords: [
    "pm2 alternative dev",
    "pm2 vs lpm",
    "dev process manager",
    "node dev process manager",
    "pm2 for local development",
    "node.js process manager",
  ],
  alternates: { canonical: PATH },
  openGraph: {
    title: "PM2 Alternative for Local Development — lpm vs PM2",
    description:
      "PM2 is production-first and also supports local watch mode. lpm adds a Mac workspace, per-service panes, project switching, and agent copies.",
    type: "website",
    url: PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "PM2 Alternative for Local Development — lpm vs PM2",
    description:
      "PM2 is production-first with local watch mode. lpm specializes in an interactive, multi-project Mac workspace.",
  },
};

const MATRIX_ROWS: MatrixRow[] = [
  {
    label: "Starts multiple processes with one command",
    lpm: true,
    competitor: true,
  },
  {
    label: "Primary focus",
    lpm: "local dev workflow",
    competitor: "production-first",
  },
  {
    label: "Local file-watch restart mode",
    lpm: "via service command",
    competitor: "pm2-dev / --watch",
  },
  {
    label: "Per-service live output pane",
    lpm: true,
    competitor: "logs / attach",
  },
  {
    label: "Native macOS desktop app",
    lpm: true,
    competitor: false,
  },
  {
    label: "Visual multi-project switcher",
    lpm: true,
    competitor: false,
  },
  {
    label: "Generates project config from your repo",
    lpm: true,
    competitor: false,
  },
  {
    label: "Runs Node, Python, shell commands, and binaries",
    lpm: true,
    competitor: true,
  },
  {
    label: "Duplicate a project for a second AI agent",
    lpm: true,
    competitor: false,
  },
  {
    label: "Designed for Claude Code / Codex in parallel",
    lpm: true,
    competitor: false,
  },
  {
    label: "Cluster mode across CPU cores",
    lpm: false,
    competitor: true,
  },
  {
    label: "Auto-restart on crash with backoff",
    lpm: false,
    competitor: true,
  },
  {
    label: "Runs at server boot (pm2 startup / save)",
    lpm: false,
    competitor: true,
  },
  {
    label: "Zero-downtime reload on deploy",
    lpm: false,
    competitor: true,
  },
  {
    label: "Log rotation and centralized log files",
    lpm: "live dev panes",
    competitor: "log files; rotation add-on",
  },
  {
    label: "CPU / memory monitoring dashboard",
    lpm: "no resource dashboard",
    competitor: "pm2 monit + Plus",
  },
  {
    label: "Config format",
    lpm: "name + command per service",
    competitor: "ecosystem.config.js",
  },
  {
    label: "Open source, free",
    lpm: true,
    competitor: true,
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Can I use lpm in production instead of PM2?",
    answer:
      "No, and that is not the pitch. lpm is a local dev-workflow tool. PM2 is production-first, with cluster mode, crash recovery, boot persistence, and zero-downtime reloads; it also provides pm2-dev and watch mode for local development. If you are deploying an app to a server, use PM2. If you want a visual workspace around local services and agents, use lpm.",
  },
  {
    question: "Does lpm cluster Node processes across cores like PM2?",
    answer:
      "No. Cluster mode is a production concern — PM2 forks your Node app across CPU cores and load-balances between workers so a single box serves more traffic. lpm doesn't do that. In dev you usually want one instance of each service so logs and debugger breakpoints map to a single process. If you need clustering, that is a signal you want PM2 in front of your app, not lpm.",
  },
  {
    question: "I run non-Node projects — Rails, Django, Go. Does lpm help more than PM2 there?",
    answer:
      "PM2 can start Python applications, shell commands, and binaries as well as Node apps. lpm's difference is the local workspace around those processes: repo detection, generated service config, one pane per service, project switching, and isolated copies for parallel agents. If you need a server supervisor, choose PM2; if you need that interactive Mac workflow, choose lpm.",
  },
  {
    question: "How do I migrate from ecosystem.config.js to lpm?",
    answer: (
      <>
        You don&apos;t fully migrate — you&apos;d keep ecosystem.config.js for
        production and add an lpm config for dev. lpm uses a{" "}
        <Link
          href={CONFIG_PATH}
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          small per-project config file
        </Link>{" "}
        you can read, edit, and commit, where each service is just a name and
        a command — which maps cleanly to the apps array in
        ecosystem.config.js: take each entry&apos;s name and script/args, drop
        it into the lpm config, and you&apos;re running. Env vars, cwd, and
        ports are handled in the lpm config separately. Or let lpm read the
        repo and generate the config for you.
      </>
    ),
    answerText:
      "You don't fully migrate — you'd keep ecosystem.config.js for production and add an lpm config for dev. lpm uses a small per-project config file you can read, edit, and commit, where each service is just a name and a command — which maps cleanly to the apps array in ecosystem.config.js: take each entry's name and script/args, drop it into the lpm config, and you're running. Env vars, cwd, and ports are handled in the lpm config separately. Or let lpm read the repo and generate the config for you.",
  },
  {
    question: "Can I keep PM2 for production and use lpm locally?",
    answer:
      "Yes. Keep ecosystem.config.js and PM2 in your deployment workflow, then add an lpm config for the local commands you actively develop against. That avoids nesting two process supervisors while preserving PM2's production behavior and giving local development lpm's service panes, project switcher, and parallel-agent copies.",
  },
];

const structuredData = [
  webPageJsonLd({
    title: "PM2 Alternative for Local Development — lpm vs PM2",
    description:
      "PM2 is a production-first daemon with local watch mode. Compare it with lpm's Mac workspace, per-service panes, project switching, and agent copies.",
    path: PATH,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Compare", path: VS_BASE_PATH },
    { name: "PM2", path: PATH },
  ]),
];

export default function LpmVsPm2Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <ComparisonHero
        eyebrow="lpm vs PM2"
        title="A PM2 alternative built for the local development loop."
        description="PM2 is a production-first process supervisor with local watch and development modes. lpm specializes in the interactive Mac workflow around your services: live panes, project switching, and isolated copies for parallel agents."
      />

      <ComparisonBasis
        reviewed="July 26, 2026"
        sources={[
          {
            href: "https://pm2.keymetrics.io/docs/usage/pm2-development/",
            label: "PM2 development docs",
          },
          {
            href: "https://pm2.keymetrics.io/docs/usage/process-management/",
            label: "PM2 process-management docs",
          },
        ]}
      />

      <FeatureMatrix
        title="PM2 and lpm, feature by feature"
        description="PM2 has mature process supervision, monitoring, and a local watch mode. lpm adds a project-aware Mac workspace with service panes and parallel-agent copies."
        competitorName="PM2"
        rows={MATRIX_ROWS}
      />

      <WhenToPick
        title="When each one is the right tool"
        description="Both run multiple processes. PM2 is strongest as a supervisor and also offers local watch mode; lpm specializes in an interactive multi-project Mac workspace."
        lpm={{
          name: "lpm",
          headline:
            "You're in the dev loop — multiple projects, mixed stacks, or AI agents running in parallel.",
          points: [
            "You switch between several local projects a day and want a visual switcher instead of terminal tabs.",
            "Your stack is Rails, Next.js, Go, Django, Flask, or Docker Compose — not just Node — and you want first-class framework detection.",
            "You want each service in its own live pane in a native macOS app, not one interleaved log stream.",
            "You run Claude Code, Codex, Cursor, or aider in parallel and need each agent's output visible at once.",
            "You want to duplicate a project so a second agent can work on its own copy of the stack without conflicts.",
          ],
        }}
        competitor={{
          name: "PM2",
          headline:
            "You need deployment supervision or already rely on PM2's local watch workflow.",
          points: [
            "You deploy Node to production or staging and need cluster mode across CPU cores with load balancing.",
            "You need auto-restart on crash with exponential backoff, memory limits, and graceful reloads.",
            "You need pm2 startup + pm2 save so the app comes back after a reboot.",
            "You need log rotation, centralized log files, and integrations like PM2 Plus / Keymetrics for monitoring.",
            "You want pm2-dev or --watch to restart a local application when its files change.",
          ],
        }}
      />

      <DemoSection />

      <Faq
        title="lpm vs PM2 — the honest FAQ"
        items={FAQ_ITEMS}
      />

      <RelatedPages
        links={[
          {
            href: MAC_TERMINAL_DEVELOPERS_PATH,
            title: "Mac terminal for developers",
            description:
              "Run your whole stack — services, logs, and agents — in one native Mac app.",
          },
          {
            href: vsPath("docker-compose"),
            title: "lpm vs Docker Compose",
            description:
              "Native dev versus containers for the local stack you edit every day.",
          },
        ]}
      />

      <Cta
        title="Keep PM2 for supervision. Add lpm for the workspace."
        description="Use the tool that matches the job: PM2 for mature runtime supervision, lpm for per-service panes, multi-project switching, and parallel AI-agent workflows."
      />
    </>
  );
}
