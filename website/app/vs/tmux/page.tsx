import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import { ComparisonHero } from "@/components/vs/comparison-hero";
import { Cta } from "@/components/vs/cta";
import { Faq, type FaqItem } from "@/components/vs/faq";
import { FeatureMatrix, type MatrixRow } from "@/components/vs/feature-matrix";
import { WhenToPick } from "@/components/vs/when-to-pick";
import {
  AI_AGENTS_PATH,
  REPO_URL,
  VS_BASE_PATH,
  vsPath,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";

const PATH = vsPath("tmux");

export const metadata: Metadata = {
  title: { absolute: "tmux Alternative for Mac — Run Dev Stacks Without Config" },
  description:
    "tmux-level visibility, one-command start, no config. An honest comparison of lpm and tmux for running local dev stacks with services in panes.",
  keywords: [
    "tmux alternative dev",
    "tmux vs lpm",
    "tmux for dev projects",
    "tmuxinator alternative",
    "tmux dev stack",
    "lpm vs tmux",
  ],
  alternates: { canonical: PATH },
  openGraph: {
    title: "tmux Alternative for Mac — Run Dev Stacks Without Config",
    description:
      "tmux-level visibility, one-command start, no config. How lpm compares to tmux when you use it only as a crude dev-stack process manager.",
    type: "website",
    url: PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "tmux Alternative for Mac — Run Dev Stacks Without Config",
    description:
      "tmux-level visibility, one-command start, no config. An honest comparison of lpm and tmux for local dev stacks.",
  },
};

const MATRIX_ROWS: MatrixRow[] = [
  {
    label: "One-command project start",
    lpm: true,
    competitor: "via tmuxinator",
  },
  {
    label: "Zero config to run a detected stack",
    lpm: true,
    competitor: false,
  },
  {
    label: "Auto-detect Rails, Next.js, Go, Django, Flask, Docker Compose",
    lpm: true,
    competitor: false,
  },
  {
    label: "Pane-per-service live output",
    lpm: true,
    competitor: true,
  },
  {
    label: "Native macOS desktop app with visual switcher",
    lpm: true,
    competitor: false,
  },
  {
    label: "Multi-project management as a first-class concept",
    lpm: true,
    competitor: "via tmuxinator",
  },
  {
    label: "Start / stop / duplicate projects as first-class ops",
    lpm: true,
    competitor: "manual",
  },
  {
    label: "Built for running AI agents (Claude Code, Codex) in parallel",
    lpm: true,
    competitor: "manual",
  },
  {
    label: "Session detach / reattach across terminal restarts",
    lpm: true,
    competitor: true,
  },
  {
    label: "Works over SSH on any Unix box",
    lpm: false,
    competitor: true,
  },
  {
    label: "Fully scriptable keybindings and layouts",
    lpm: false,
    competitor: "via .tmux.conf",
  },
  {
    label: "Tiny footprint, ubiquitous on Unix systems",
    lpm: false,
    competitor: true,
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Can I still use tmux alongside lpm?",
    answer:
      "Absolutely. lpm manages your project's services — it has no opinion on your editor, shell, or terminal setup. Keep tmux for SSH, long-lived sessions, vim splits, and anything else you already use it for. Let lpm handle the boring part: starting the dev stack when you open a project.",
  },
  {
    question: "Does lpm use tmux under the hood?",
    answer:
      "What matters is the behavior: your services run in persistent sessions that survive app and terminal restarts, and each one gets its own scrollable pane in the desktop app. There's nothing to install, configure, or attach to — no .tmux.conf to edit, no keybindings to memorize, no windows to attach to by name. You get the persistence and per-service visibility you'd normally build with tmux, without setting any of it up.",
  },
  {
    question: "What about my remote / SSH workflow?",
    answer:
      "lpm can attach remote dev boxes as SSH projects — run remote services in panes beside local ones and forward remote ports to localhost from the app. That said, if your entire session lives inside SSH on a remote box and you reach it from arbitrary machines, tmux on that box is still the right tool — lpm is not trying to replace it there.",
  },
  {
    question: "Is this basically tmuxinator with a GUI?",
    answer:
      "Overlapping goals, different shape. tmuxinator gives you named, YAML-defined tmux layouts per project. lpm gives you managed projects with live pane output, a visual switcher, and first-class start / stop / duplicate. If your tmuxinator file is mostly `rails s`, `npm dev`, `redis`, `sidekiq`, lpm will feel like a shortcut. If you lean on custom layouts, splits, and keybindings, tmuxinator will still suit you better.",
  },
  {
    question: "How do I move a tmuxinator project over to lpm?",
    answer: (
      <>
        Point lpm at the directory and let it generate the service config
        from your repo, or define the services yourself — each one is just a
        name and a command. Then start the project from the app.
        You can keep the tmuxinator file around as a fallback; lpm
        won&apos;t touch it. Source and examples are on{" "}
        <a
          href={REPO_URL}
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          GitHub
        </a>
        .
      </>
    ),
    answerText: `Point lpm at the directory and let it generate the service config from your repo, or define the services yourself — each one is just a name and a command. Then start the project from the app. You can keep the tmuxinator file around as a fallback; lpm won't touch it. Source and examples are on GitHub at ${REPO_URL}.`,
  },
];

const structuredData = [
  webPageJsonLd({
    title: "tmux Alternative for Mac — Run Dev Stacks Without Config",
    description:
      "tmux-level visibility, one-command start, no config. An honest comparison of lpm and tmux for running local dev stacks with services in panes.",
    path: PATH,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Compare", path: VS_BASE_PATH },
    { name: "tmux", path: PATH },
  ]),
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
        title="A tmux alternative for local dev stacks — panes without config."
        description="tmux is a wonderful terminal multiplexer. lpm is a project manager for your local dev stacks that happens to give you the same pane-per-service layout for free. If you only use tmux to wire up your dev stack, this page is for you."
      />

      <DemoSection />

      <FeatureMatrix
        title="Where each tool earns its keep"
        description="tmux wins on persistence, ubiquity, and raw flexibility. lpm wins on first-class projects, zero-config start, and a desktop app. Here is the honest side-by-side."
        competitorName="tmux"
        rows={MATRIX_ROWS}
      />

      <WhenToPick
        title="Which one should you actually use?"
        description="tmux and lpm do different jobs that overlap only at 'run services in panes.' Pick based on what you really need, not on which tool is newer."
        lpm={{
          name: "lpm",
          headline:
            "You use tmux mostly as a crude process manager for your dev stack.",
          points: [
            "You open a project and immediately run rails s, npm dev, redis, and a worker in separate panes — every single time.",
            "You do not want to maintain a .tmux.conf or a tmuxinator YAML for every project.",
            "You juggle multiple local projects and want a visual switcher that remembers them.",
            "You want to run Claude Code, Codex, or other AI agents in parallel with every service's output visible at once.",
            "You like the idea of a native macOS desktop app with live per-service panes and a config you can read, edit, and commit.",
          ],
        }}
        competitor={{
          name: "tmux",
          headline:
            "You already love tmux and use it for much more than starting services.",
          points: [
            "You have years of muscle memory and a .tmux.conf you actually enjoy.",
            "Most of your work happens inside SSH sessions on remote machines.",
            "You need sessions that survive terminal crashes, reboots, and ssh drops.",
            "You use tmux for vim splits, logs, monitoring, ops work — not just dev servers.",
            "You already have a tmuxinator or zellij layout that fits your brain perfectly.",
            "You work on a platform other than macOS — lpm is macOS-only.",
          ],
        }}
      />

      <Faq
        title="lpm vs tmux, answered honestly"
        items={FAQ_ITEMS}
      />

      <RelatedPages
        links={[
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "Run AI coding agents next to your services with status on every tab.",
          },
          {
            href: vsPath("overmind"),
            title: "lpm vs Overmind",
            description:
              "The Procfile runner comparison, for when your panes come from a Procfile.",
          },
        ]}
      />

      <Cta
        title="Keep tmux. Let lpm start the boring stuff."
        description="lpm is free, open source, and runs as a native macOS app. Point it at a project, hit Start, and get your whole stack running with per-service output — no tmux config required."
      />
    </>
  );
}
