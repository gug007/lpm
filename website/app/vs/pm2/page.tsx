import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/config/code-block";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import { ComparisonHero } from "@/components/vs/comparison-hero";
import { Cta } from "@/components/vs/cta";
import { Faq, type FaqItem } from "@/components/vs/faq";
import { QuickAnswer } from "@/components/vs/quick-answer";
import { VS_REVIEWED_ISO } from "@/components/vs/reviewed";
import { SectionVideo } from "@/components/vs/section-video";
import { VerdictCards, type VerdictCard } from "@/components/vs/verdict-cards";
import { WhenToPick } from "@/components/vs/when-to-pick";
import {
  AI_AGENTS_PATH,
  CONFIG_PATH,
  CONNECT_AGENTS_PATH,
  VS_BASE_PATH,
  WORKTREE_AGENTS_PATH,
  vsPath,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  screenRecordingJsonLd,
  webPageJsonLd,
} from "@/lib/structured-data";
import { EcosystemToLpm } from "./_components/ecosystem-to-lpm";
import { Pm2Basis } from "./_components/pm2-basis";
import { Pm2Matrix } from "./_components/pm2-matrix";
import { SurvivesQuit } from "./_components/survives-quit";
import { VerbMap } from "./_components/verb-map";

const PATH = vsPath("pm2");
const TMUX_PATH = vsPath("tmux");

const TITLE = "PM2 Alternative for Local Dev: Panes, Not a Daemon";
const DESCRIPTION =
  "PM2 supervises production. Locally you want a live pane per service you can read and search, not a daemon — plus the six things PM2 does that lpm does not.";

const QUESTION = "Can you use PM2 for local development?";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "pm2 alternative dev",
    "pm2 for local development",
    "pm2 vs tmux",
    "pm2 vs lpm",
    "pm2 local dev",
    "ecosystem.config.js alternative",
    "pm2 dev mode",
    "run multiple dev servers mac",
    "start all services one command mac",
    "claude code parallel sessions",
    "codex parallel agents",
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

const BOTH_TOOLS = `pm2 start ecosystem.config.js --only "web,api"
lpm start myapp --profile dev`;

const VERDICT_CARDS: [VerdictCard, VerdictCard, VerdictCard] = [
  {
    label: "PM2",
    title: "Keep PM2",
    body: "You deploy Node and need cluster mode across cores, restart-on-crash with backoff, boot persistence, and zero-downtime reload.",
  },
  {
    label: "lpm",
    title: "Add lpm",
    body: "You want every service in its own live pane, a switcher across projects, and copies of the stack for parallel agents.",
  },
  {
    label: "Both",
    title: "Run both",
    body: "ecosystem.config.js on the server, .lpm.yml on the laptop. They never nest and they never fight.",
  },
];

const QUIT_ANSWER =
  "Yes. They run outside the app, so closing the window leaves them up and relaunching finds them again. A reboot is the exception — there is no pm2 startup equivalent, so you start the project again.";

const NEST_ANSWER =
  "You can: a service's command is just a shell line, so pm2-runtime start ecosystem.config.js runs in a pane like anything else. Most people do not, because you would then have two things deciding whether a process is alive. Point lpm at the same commands your ecosystem file runs and skip the layer.";

const TMUX_ANSWER =
  "PM2 restarts what dies; tmux holds a detached session until you attach to it again. Neither one stands in for the other, so running both is a fair answer — one supervises, one keeps the window. If the pair is only there to give you a single workspace, that overlap is the job lpm does, with no tmux underneath it.";

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
    question: "Do my services keep running if I quit lpm?",
    answer: (
      <>
        Yes. They run outside the app, so closing the window leaves them up and
        relaunching finds them again. A reboot is the exception — there is no{" "}
        <code className="font-mono">pm2 startup</code> equivalent, so you start
        the project again.
      </>
    ),
    answerText: QUIT_ANSWER,
  },
  {
    question: "Can I run PM2 inside lpm?",
    answer: (
      <>
        You can: a service&apos;s command is just a shell line, so{" "}
        <code className="font-mono">
          pm2-runtime start ecosystem.config.js
        </code>{" "}
        runs in a pane like anything else. Most people do not, because you would
        then have two things deciding whether a process is alive. Point lpm at
        the same commands your ecosystem file runs and skip the layer.
      </>
    ),
    answerText: NEST_ANSWER,
  },
  {
    question: "Should I run PM2 and tmux together, or neither?",
    answer: (
      <>
        PM2 restarts what dies; tmux holds a detached session until you attach
        to it again. Neither one stands in for the other, so running both is a
        fair answer — one supervises, one keeps the window. If the pair is only
        there to give you a single workspace, that overlap is the job lpm does,{" "}
        <Link
          href={TMUX_PATH}
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          with no tmux underneath it
        </Link>
        .
      </>
    ),
    answerText: TMUX_ANSWER,
  },
  {
    question: "Can I keep PM2 for production and use lpm locally?",
    answer:
      "Yes. Keep ecosystem.config.js and PM2 in your deployment workflow, then add the repo to lpm for the laptop: it lists the dev commands it finds, and you keep the ones you actively develop against. Supervision stays with PM2, and local development gets lpm's service panes, project switcher, and parallel-agent copies.",
  },
];

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: PATH,
    about: [
      "PM2 alternatives for local development",
      "PM2 versus tmux",
      "ecosystem.config.js",
      "running multiple dev servers on macOS",
      "parallel Claude Code and Codex sessions",
    ],
    dateModified: VS_REVIEWED_ISO,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Compare", path: VS_BASE_PATH },
    { name: "PM2", path: PATH },
  ]),
  screenRecordingJsonLd("agent-run-command"),
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
        title="A PM2 alternative for local development — and what to keep PM2 for."
        description="PM2 is a production supervisor that also watches files in dev. lpm is the Mac workspace around your local stack: one pane per service, a switcher across repos, and copies for parallel agents."
        verdictLine="If both columns describe you, that is the normal case — run both."
        jumpHref="#map"
        jumpLabel="Every pm2 verb, mapped"
        downloadSource="vs-pm2-hero"
      />

      <QuickAnswer question={QUESTION}>
        <p>
          Yes. <code className="font-mono">pm2-dev</code> and{" "}
          <code className="font-mono whitespace-nowrap">--watch</code> restart your app on file
          change, and if PM2 already runs production, one config for both is a
          real reason to stay.
        </p>
        <p>
          What PM2 does not give you locally is a pane per service you can read
          and search, a switcher across projects, or a second copy of the stack
          for a parallel agent. It is a supervisor, not a workspace. lpm is the
          workspace, and it is additive: it supervises nothing in production and
          it never wraps PM2. Keep{" "}
          <code className="font-mono">ecosystem.config.js</code> for the server;
          for the laptop, declare those same services to lpm — kept to yourself
          in your own project file, or committed as a{" "}
          <code className="font-mono">.lpm.yml</code> so a teammate gets the same
          set.
        </p>
        <CodeBlock filename="Same two services, both tools">
          {BOTH_TOOLS}
        </CodeBlock>
      </QuickAnswer>

      <VerdictCards cards={VERDICT_CARDS} />

      <SurvivesQuit />

      <Pm2Basis />

      <Pm2Matrix />

      <VerbMap />

      <EcosystemToLpm />

      <SectionVideo
        eyebrow="See it"
        title="The CLI, driven by an agent"
        description="The same verbs above, called by Claude Code — a fresh tab opens in lpm with the output."
        clip="agent-run-command"
        label="Claude Code runs a command through the lpm CLI and a fresh terminal tab opens with the output."
      />

      <WhenToPick
        title="When PM2 is the right tool, and when lpm is"
        description="Both run multiple processes. PM2 is strongest as a supervisor and also offers local watch mode; lpm specializes in an interactive multi-project Mac workspace. And if both columns describe you, that is the normal case."
        lpm={{
          name: "lpm",
          headline:
            "You're in the dev loop — multiple projects, mixed stacks, or AI agents running in parallel.",
          points: [
            "You switch between several local projects a day and want a visual switcher instead of terminal tabs.",
            "Your stack is not just Node: a Go binary, a Python worker, a Rails server and a docker compose up sit in one config, each with its own pane. Add the folder and lpm writes the service list from your package.json, Procfile, Gemfile or go.mod — the dev script run by the package manager the repo declares or locks, framework ports included — and suggests Makefile or justfile targets as buttons.",
            "You want each service in its own live pane in a native macOS app, not one interleaved log stream.",
            "You run Claude Code and Codex in parallel and want each session's output and status visible at once.",
            "You want to duplicate a project so a second agent works on its own checkout instead of the files you are editing. Both copies still reach the same database and the same ports — lpm names the process already holding one before a project starts.",
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

      <Faq title="Keeping PM2, or moving off it" items={FAQ_ITEMS} />

      <RelatedPages
        links={[
          {
            href: TMUX_PATH,
            title: "lpm vs tmux",
            description:
              "If PM2 and tmux are both in your setup: what changes when the tool you are replacing keeps panes alive rather than processes.",
          },
          {
            href: vsPath("docker-compose"),
            title: "lpm vs Docker Compose",
            description:
              "When the things you are starting are images rather than npm scripts, and what a container stack costs on a laptop.",
          },
          {
            href: CONFIG_PATH,
            title: "The lpm config reference",
            description:
              "services, port, env, dependsOn and profiles — every field a service can take, with worked examples.",
          },
          {
            href: CONNECT_AGENTS_PATH,
            title: "Let an agent drive lpm",
            description:
              "How Claude Code and Codex call the CLI: start a project, wait for a port, read a pane, queue the next command.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "A terminal for Claude Code and Codex",
            description:
              "The tab beside your services: status on the tab while an agent works, and a diff to review before you keep it.",
          },
          {
            href: WORKTREE_AGENTS_PATH,
            title: "A second checkout per agent",
            description:
              "Linked worktrees for parallel agents, and the .env and node_modules a fresh checkout does not bring.",
          },
        ]}
      />

      <Cta
        title="Keep PM2 for supervision. Add lpm for the workspace."
        description={
          <>
            MIT-licensed, free, no account. PM2 stays where it belongs — on the
            server. lpm takes the laptop: a pane per service, a switcher across
            projects, and copies of the stack for Claude Code and Codex.
            <span className="mt-4 block">
              Not installing today? Drop the{" "}
              <Link
                href={CONFIG_PATH}
                className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
              >
                <code className="font-mono">.lpm.yml</code>
              </Link>{" "}
              above into the repo, beside your{" "}
              <code className="font-mono">ecosystem.config.js</code>. Point lpm
              at that folder whenever you get to it — the services are already
              declared, and anything lpm also detects there is yours to prune.
            </span>
          </>
        }
        downloadSource="vs-pm2-cta"
      />
    </>
  );
}
