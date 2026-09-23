import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/config/code-block";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import { ComparisonBasis } from "@/components/vs/comparison-basis";
import { ComparisonHero } from "@/components/vs/comparison-hero";
import { Cta } from "@/components/vs/cta";
import { Faq } from "@/components/vs/faq";
import { QuickAnswer } from "@/components/vs/quick-answer";
import { VS_REVIEWED, VS_REVIEWED_ISO } from "@/components/vs/reviewed";
import { SectionVideo } from "@/components/vs/section-video";
import { VerdictCards, type VerdictCard } from "@/components/vs/verdict-cards";
import { WhenToPick } from "@/components/vs/when-to-pick";
import {
  AI_AGENTS_PATH,
  CONFIG_PATH,
  LINUX_HOST_PATH,
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
import { FOREMAN_FAQ } from "./_components/faq-data";
import { Migrate } from "./_components/migrate";
import { OneTerminal } from "./_components/one-terminal";
import { ProcfileMatrix } from "./_components/procfile-matrix";

const PATH = vsPath("foreman");
const OVERMIND_PATH = vsPath("overmind");

const TITLE = "Foreman vs Overmind: Procfile Dev for Rails on Mac";
const DESCRIPTION =
  "Foreman interleaves one log stream; Overmind needs tmux. Both read your Procfile. lpm converts the lines into live panes on macOS — all three compared.";

const QUESTION = "Foreman or Overmind for a Rails Procfile?";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "foreman vs overmind",
    "foreman alternative rails",
    "run procfile locally",
    "procfile.dev",
    "bin/dev rails",
    "foreman ruby gem",
    "foreman start",
    "heroku local alternative",
    "restart one process foreman",
    "rails procfile setup mac",
    "procfile runner mac",
    "foreman vs overmind vs lpm",
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

const PROCFILE = `web: bin/rails server -p 3000
css: bin/rails tailwindcss:watch
worker: bundle exec sidekiq`;

const LPM_SERVICES = `services:
  web:
    cmd: bin/rails server -p 3000
    port: 3000
  css:
    cmd: bin/rails tailwindcss:watch
  worker:
    cmd: bundle exec sidekiq`;

const VERDICT_CARDS: [VerdictCard, VerdictCard, VerdictCard] = [
  {
    label: "Foreman",
    title: "Keep Foreman",
    body: "Two lines in Procfile.dev, $PORT assigned for you, .env loaded automatically, and foreman export generating the launchd or systemd units your deploy needs.",
  },
  {
    label: "Overmind",
    title: "Keep Overmind",
    body: "overmind connect web to attach one process, restart it without the rest, -m web=2 to scale it, and Linux or *BSD support.",
  },
  {
    label: "lpm",
    title: "Switch to lpm",
    body: "A pane per process, a project switcher across repos, services that outlive the app, and Claude Code or Codex in the next tab. Mac only, and it takes Procfile.dev in once, as the project is added, rather than on every start.",
  },
];

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: PATH,
    about: [
      "Procfile-based local development",
      "Foreman versus Overmind",
      "running a Rails stack on macOS",
      "per-process restart in local development",
      "parallel Claude Code and Codex sessions",
    ],
    dateModified: VS_REVIEWED_ISO,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Compare", path: VS_BASE_PATH },
    { name: "Foreman", path: PATH },
  ]),
  screenRecordingJsonLd("add-action"),
];

export default function LpmVsForemanPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <ComparisonHero
        eyebrow="Procfile dev on macOS"
        title="Foreman vs Overmind for a Rails Procfile — and a third option."
        description="Both read the same Procfile.dev. Foreman interleaves everything on one stdout stream, Overmind gives each process a tmux window, and lpm gives every line a live pane of its own."
        verdictLine="If your Procfile.dev is two lines and nothing ever crashes, Foreman is still the answer."
        jumpHref="#matrix"
        jumpLabel="See all three side by side"
        downloadSource="vs-foreman-hero"
      />

      <ComparisonBasis
        reviewed={VS_REVIEWED}
        reviewedIso={VS_REVIEWED_ISO}
        sources={[
          {
            href: "https://ddollar.github.io/foreman/",
            label: "the foreman man page",
          },
          {
            href: "https://github.com/ddollar/foreman",
            label: "the Foreman README",
          },
          {
            href: "https://github.com/ddollar/foreman/blob/master/lib/foreman/engine.rb",
            label: "the code that ends a formation",
          },
          {
            href: "https://github.com/DarthSim/overmind",
            label: "the Overmind README",
          },
          {
            href: "https://github.com/rails/tailwindcss-rails",
            label: "tailwindcss-rails on bin/dev",
          },
          {
            href: "https://rubygems.org/gems/foreman/versions",
            label: "the foreman gem's version list",
          },
          {
            href: "https://github.com/DarthSim/overmind/releases",
            label: "Overmind's release tags",
          },
        ]}
        lpmNote="The foreman gem sits at 0.90.0 from July 2025; Overmind's newest tag, v2.5.1, is from March 2024. Every lpm cell was re-read off the app's own source."
      />

      <QuickAnswer question={QUESTION}>
        <p>
          <Link
            href={OVERMIND_PATH}
            className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
          >
            Overmind
          </Link>
          , if you want to attach to or restart one process without touching the
          rest — it runs each process in its own tmux window to make that
          possible, and{" "}
          <code className="whitespace-nowrap">-m web=2,worker=3</code>{" "}
          scales one of them.
          Foreman, if one interleaved stream on stdout is all you need, if you
          would rather not install tmux, or if your deploy depends on{" "}
          <code>foreman export</code>.
        </p>
        <p>
          There is a third shape. <code>foreman start</code> puts your whole
          stack in one terminal, and when the CSS watcher dies it takes Rails
          with it. lpm runs the same <code>web</code>, <code>css</code> and{" "}
          <code>worker</code> lines as separate live panes on macOS — restart
          one, leave the rest alone, and quit the app without killing anything.
          Add the folder and lpm reads <code>Procfile.dev</code>{" "}
          for you, one service per line, with the{" "}
          <code className="whitespace-nowrap">-p 3000</code>{" "}
          kept as the port it watches.
        </p>
        <CodeBlock filename="Procfile.dev">{PROCFILE}</CodeBlock>
        <CodeBlock filename="What lpm lists after you add the folder">
          {LPM_SERVICES}
        </CodeBlock>
        <p>
          That is the whole migration, and nobody types it. What changes is not
          the declaration — it is that <code>worker</code>{" "}
          can crash without taking <code>web</code>{" "}down with it.
        </p>
      </QuickAnswer>

      <VerdictCards cards={VERDICT_CARDS} />

      <OneTerminal />

      <ProcfileMatrix />

      <Migrate />

      <SectionVideo
        eyebrow="See it"
        title="rails db:migrate as a button"
        description="The one-off commands you run with foreman run become actions you click, or call with lpm run."
        clip="add-action"
        label="Adding a one-shot action to a project in lpm — a migration, a linter, or a test run as a button."
      />

      <WhenToPick
        title="When each one is the right tool"
        description="Both start the same commands from the same one-line declaration. The split is what happens after they are running."
        lpm={{
          name: "lpm",
          headline:
            "Your stack has more than two processes, or a second agent is about to want its own copy of it.",
          points: [
            "You want the CSS watcher to die on its own without taking Rails down, and to bring just that one back.",
            "A pane per process beats scrolling one stream to find which one printed the error.",
            "You quit the app at lunch and want the dev servers still up when you get back.",
            "Two or three repos are up at once and you would rather click between them than count terminal tabs.",
            "Claude Code or Codex is about to want its own checkout of this project — anywhere from 1 to 50 of them. A linked worktree arrives without your .env, and lpm's Install dependencies covers Node packages, not a bundle install.",
            "lpm does not lock the project in — it runs the same commands your Procfile already names.",
          ],
        }}
        competitor={{
          name: "Foreman or Overmind",
          headline: "The Procfile runner you already have is enough.",
          points: [
            "Your Procfile.dev is two lines and neither of them ever crashes (Foreman).",
            "You want $PORT assigned and .env loaded without writing either down (both).",
            "foreman export generates the units your deploy depends on (Foreman).",
            "One interleaved stream is genuinely how you read your app (Foreman).",
            "You need overmind connect and per-process restart, and tmux is already installed (Overmind).",
            "Someone on the team develops on Linux (Foreman and Overmind both run there; Overmind on *BSD too).",
          ],
        }}
      />

      <DemoSection />

      <Faq
        title="Foreman, Overmind and lpm — the honest answers"
        items={FOREMAN_FAQ}
      />

      <RelatedPages
        links={[
          {
            href: OVERMIND_PATH,
            title: "lpm vs Overmind",
            description:
              "The two-way version of this page: what changes when the Procfile runner you already have is tmux-backed.",
          },
          {
            href: vsPath("docker-compose"),
            title: "lpm vs Docker Compose",
            description:
              "When the services in your stack are images rather than Procfile lines, and what you give up either way.",
          },
          {
            href: CONFIG_PATH,
            title: "Every field in the config",
            description:
              "services, port, env, dependsOn, profiles and actions — the reference for the file you just converted into.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "A terminal for Claude Code and Codex",
            description:
              "What it looks like to keep an agent in the tab next to the panes running your Rails stack.",
          },
          {
            href: WORKTREE_AGENTS_PATH,
            title: "Worktrees for parallel agents",
            description:
              "Where the copies come from when two agents need the same repo, and exactly what a copy does not carry.",
          },
          {
            href: LINUX_HOST_PATH,
            title: "A Linux box for the Rails processes",
            description:
              "Pair a headless Linux machine, run the stack and the agents there, and drive both from the Mac window.",
          },
        ]}
      />

      <Cta
        title="Three lines in a Procfile. Three panes on your Mac."
        description="lpm starts the same commands your Procfile.dev already names, one pane each, and leaves them running when you quit the app. Free, MIT-licensed, macOS."
        downloadSource="vs-foreman-cta"
      />
    </>
  );
}
