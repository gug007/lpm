import type { Metadata } from "next";
import Link from "next/link";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import { ComparisonBasis } from "@/components/vs/comparison-basis";
import { ComparisonHero } from "@/components/vs/comparison-hero";
import { Cta } from "@/components/vs/cta";
import { Faq, type FaqItem } from "@/components/vs/faq";
import { VS_REVIEWED, VS_REVIEWED_ISO } from "@/components/vs/reviewed";
import { SectionVideo } from "@/components/vs/section-video";
import { VerdictCards, type VerdictCard } from "@/components/vs/verdict-cards";
import { WhenToPick } from "@/components/vs/when-to-pick";
import {
  AI_AGENTS_PATH,
  CONFIG_PATH,
  PROJECT_SIDEBAR_PATH,
  SSH_TERMINAL_MAC_PATH,
  VS_BASE_PATH,
  vsPath,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  screenRecordingJsonLd,
  webPageJsonLd,
} from "@/lib/structured-data";
import Commands from "./_components/commands";
import Jobs from "./_components/jobs";
import Matrix from "./_components/matrix";
import Migrate from "./_components/migrate";
import ShortAnswer from "./_components/short-answer";

const PATH = vsPath("tmux");

const TITLE = "tmux & tmuxinator Alternative for Mac Dev Stacks";
const DESCRIPTION =
  "Run your dev stack one pane per service, with no .tmux.conf and no tmuxinator YAML. lpm needs no tmux installed — and here is where tmux still wins.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "tmux alternative dev",
    "tmux alternative mac",
    "tmuxinator alternative",
    "tmuxinator vs lpm",
    "tmux without config",
    "tmux dev environment",
    "tmux dev stack",
    "run dev servers in panes",
    "zellij alternative mac",
    "tmux vs lpm",
    "tmux alternative for claude code",
    "do i need tmux",
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

const VERDICT_CARDS: [VerdictCard, VerdictCard, VerdictCard] = [
  {
    label: "tmux",
    title: "Keep tmux for",
    body: "Remote sessions you reach from any machine, vim splits, ops work, and a .tmux.conf you actually enjoy.",
  },
  {
    label: "lpm",
    title: "Swap in lpm for",
    body: "Starting and stopping a project's whole stack, switching between projects, and watching Claude Code or Codex work beside the services.",
  },
  {
    label: "Both",
    title: "Run both",
    body: "lpm has no opinion on your shell or terminal, and it does not touch your .tmux.conf or your tmuxinator files. Nothing to uninstall.",
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Do I need tmux installed to use lpm?",
    answer:
      "No — tmux is not a dependency. lpm runs each service in a pane it owns, and it never installs tmux for you. If tmux is already on your machine, keep it: your .tmux.conf and your existing sessions are untouched.",
  },
  {
    question: "Does lpm use tmux under the hood?",
    answer:
      "No. Quit lpm and your dev servers keep running; reopen it and it finds them again. Each service keeps 10,000 lines of scrollback — tmux ships with 2,000 until you raise history-limit — and there is no .tmux.conf to maintain, no prefix key to learn, and no session name to attach to. lpm keeps a config too — the services map above, which it drafts from the repo when you add it — but it is names and commands, not keybindings.",
  },
  {
    question: "Can I keep using tmux alongside lpm?",
    answer:
      "Absolutely. lpm manages your project's services — it has no opinion on your editor, shell, or terminal setup. Keep tmux for SSH, long-lived sessions, vim splits, and anything else you already use it for. Let lpm handle the boring part: starting the dev stack when you open a project.",
  },
  {
    question: "Is this basically tmuxinator with a GUI?",
    answer: (
      <>
        Overlapping goals, different shape. tmuxinator gives you named,
        YAML-defined tmux layouts per project. lpm gives you managed projects
        with live pane output, a visual switcher, and first-class start / stop /
        duplicate. If your tmuxinator file is mostly <code>rails s</code>,{" "}
        <code>npm dev</code>, <code>redis</code>, and <code>sidekiq</code>, lpm
        will feel like a shortcut. If you lean on custom layouts, splits, and
        keybindings, tmuxinator will still suit you better.
      </>
    ),
    answerText:
      "Overlapping goals, different shape. tmuxinator gives you named, YAML-defined tmux layouts per project. lpm gives you managed projects with live pane output, a visual switcher, and first-class start / stop / duplicate. If your tmuxinator file is mostly rails s, npm dev, redis, and sidekiq, lpm will feel like a shortcut. If you lean on custom layouts, splits, and keybindings, tmuxinator will still suit you better.",
  },
  {
    question: "What about my remote or SSH workflow?",
    answer: (
      <>
        lpm can attach a remote dev box as an{" "}
        <Link
          href={SSH_TERMINAL_MAC_PATH}
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          SSH project
        </Link>
        : its services run in panes beside your local ones, and each port a
        service declares is forwarded to localhost once it starts listening.
        The box needs SSH and bash — no tmux server to install there either.
        lpm does not detect an SSH project&apos;s services, so you list them
        yourself. If your whole session lives inside SSH and you reach it from
        arbitrary machines, tmux on that box is still the right tool.
      </>
    ),
    answerText:
      "lpm can attach a remote dev box as an SSH project: its services run in panes beside your local ones, and each port a service declares is forwarded to localhost once it starts listening. The box needs SSH and bash — no tmux server to install there either. lpm does not detect an SSH project's services, so you list them yourself. If your whole session lives inside SSH and you reach it from arbitrary machines, tmux on that box is still the right tool.",
  },
  {
    question: "What about zellij?",
    answer:
      "Same answer as tmux: lpm does not use zellij either, and does not need it installed. If zellij is where you live, keep it — lpm's job is bringing a project's services up in its own panes, and it has no opinion on what you attach to for everything else.",
  },
];

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: PATH,
    about: [
      "tmux alternatives",
      "tmuxinator alternatives",
      "terminal multiplexers",
      "local development on macOS",
      "running dev servers in panes",
    ],
    dateModified: VS_REVIEWED_ISO,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Compare", path: VS_BASE_PATH },
    { name: "tmux", path: PATH },
  ]),
  screenRecordingJsonLd("add-project"),
];

export default function VsTmuxPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <ComparisonHero
        eyebrow="lpm vs tmux"
        title="A tmux alternative for Mac dev stacks — panes without .tmux.conf."
        description="tmux is a fine multiplexer and this page does not pretend otherwise. What it does not know is what a project is: which commands belong together, which order they start in, and which repo they came out of."
        verdictLine="Most people asking for a tmux alternative want one of tmux's three jobs. lpm takes that one."
        jumpHref="#migrate"
        jumpLabel="Coming from tmuxinator"
        downloadSource="vs-tmux-hero"
      />

      <ComparisonBasis
        reviewed={VS_REVIEWED}
        reviewedIso={VS_REVIEWED_ISO}
        sources={[
          {
            href: "https://man7.org/linux/man-pages/man1/tmux.1.html",
            label: "the tmux manual",
          },
          {
            href: "https://github.com/tmuxinator/tmuxinator",
            label: "the tmuxinator README",
          },
        ]}
        lpmNote="Where tmux is the better tool the comparison below says so, in three of its fifteen rows; every lpm cell was read off the app's own source."
      />

      <ShortAnswer />

      <VerdictCards cards={VERDICT_CARDS} />

      <Jobs />

      <Matrix />

      <Migrate />

      <Commands />

      <SectionVideo
        eyebrow="See it"
        title="A project, defined once"
        description="Adding a project and shaping its service list in the built-in editor — the whole of what replaces your tmuxinator file."
        clip="add-project"
        label="Adding a project in lpm and editing its services in the built-in editor."
      />

      <WhenToPick
        title="Which one should you actually use?"
        description="tmux and lpm do different jobs that overlap only at 'run services in panes.' Pick based on what you really need, not on which tool is newer."
        lpm={{
          name: "lpm",
          headline: "You mostly use tmux to get your dev stack running.",
          points: [
            "You open a project and immediately run rails s, npm dev, redis, and a worker in separate panes — every single time.",
            "You do not want to maintain a .tmux.conf or a tmuxinator YAML for every project.",
            "You juggle multiple local projects and want a visual switcher that remembers them.",
            "You want Claude Code and Codex running beside the services, with working / needs-you / done / error on each tab.",
            "You want a config you can read, edit, and commit as .lpm.yml so the next person gets the same stack.",
          ],
        }}
        competitor={{
          name: "tmux",
          headline:
            "You already love tmux and use it for much more than starting services.",
          points: [
            "You have years of muscle memory and a .tmux.conf you actually enjoy.",
            "Your session lives on the remote box itself and you reach it from any machine — tmux runs there; lpm drives remote projects from a Mac app instead.",
            "You need sessions you can reattach from any SSH login, not from a desktop app.",
            "You use tmux for vim splits, logs, monitoring, ops work — not just dev servers.",
            "You have a tmuxinator or zellij setup that fits your brain perfectly — lpm will not talk you out of it.",
            "You work on a platform other than macOS — lpm is macOS-only.",
          ],
        }}
      />

      <DemoSection />

      <Faq title="lpm vs tmux, answered honestly" items={FAQ_ITEMS} />

      <RelatedPages
        links={[
          {
            href: vsPath("overmind"),
            title: "lpm vs Overmind",
            description:
              "For anyone whose service list already lives in a Procfile: lpm imports it once, when the folder is added.",
          },
          {
            href: vsPath("pm2"),
            title: "lpm vs PM2 for local dev",
            description:
              "lpm does not restart a service that dies. That trade-off, at length.",
          },
          {
            href: SSH_TERMINAL_MAC_PATH,
            title: "SSH projects on a Mac",
            description:
              "Attach a dev box over SSH: its services get panes in the same window as the local ones.",
          },
          {
            href: PROJECT_SIDEBAR_PATH,
            title: "A sidebar of projects",
            description:
              "Every repo you work in, in folders, in the order you left them.",
          },
          {
            href: CONFIG_PATH,
            title: "The config reference",
            description:
              "What a project file takes: services, dependsOn, profiles, declared ports, actions.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Claude Code and Codex beside the stack",
            description:
              "The agent tabs that sit next to the service panes, and the working or needs-you state each one shows.",
          },
        ]}
      />

      <Cta
        title="Keep tmux. Let lpm bring the stack up."
        description="lpm is free, MIT-licensed, and runs as a native macOS app. Add the folder, check the services it lists, press Start, and every service comes up in its own pane — with no tmux installed."
        downloadSource="vs-tmux-cta"
      />
    </>
  );
}
