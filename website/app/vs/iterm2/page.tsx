import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { ComparisonHero } from "@/components/vs/comparison-hero";
import { Cta } from "@/components/vs/cta";
import { Faq, type FaqItem } from "@/components/vs/faq";
import {
  FeatureMatrix,
  type MatrixRow,
} from "@/components/vs/feature-matrix";
import { WhenToPick } from "@/components/vs/when-to-pick";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  BEST_TERMINAL_MAC_PATH,
  REPO_URL,
  VS_BASE_PATH,
  vsPath,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";

const PATH = vsPath("iterm2");

const TITLE = "iTerm2 Alternative for Mac — Projects, Not Just Panes";
const DESCRIPTION =
  "iTerm2 is a great terminal emulator. lpm is a project manager with a terminal inside it. Honest side-by-side, including where iTerm2 wins.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "lpm vs iterm2",
    "iterm2 alternative",
    "iterm alternative",
    "iterm2 alternative macos",
    "best terminal for mac",
    "mac terminal alternative",
  ],
  alternates: { canonical: PATH },
  openGraph: {
    title: TITLE,
    description:
      "iTerm2 is the terminal. lpm manages whole projects — services, agents, and duplicates — with a terminal inside. Honest comparison.",
    type: "website",
    url: PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "iTerm2 is the terminal. lpm manages whole projects, with a terminal inside. Honest comparison.",
  },
};

const MATRIX_ROWS: MatrixRow[] = [
  {
    label: "Primary object",
    lpm: "Project (services + agents)",
    competitor: "Terminal window (tabs + split panes)",
  },
  {
    label: "Per-project config",
    lpm: "small file you can edit and commit",
    competitor: "Profiles in app settings",
  },
  {
    label: "Auto-detect stack on init",
    lpm: true,
    competitor: false,
  },
  {
    label: "Start, stop, restart services",
    lpm: true,
    competitor: "you run each command yourself",
  },
  {
    label: "Live status per service on the tab",
    lpm: true,
    competitor: false,
  },
  {
    label: "Run a subset of services (profiles)",
    lpm: true,
    competitor: "profiles set the shell and appearance, not service sets",
  },
  {
    label: "One-shot tasks (lint, migrate, seed)",
    lpm: "buttons in the project",
    competitor: "shell history and aliases",
  },
  {
    label: "Duplicate a project for a parallel agent",
    lpm: "worktrees or standalone copies, in a batch",
    competitor: false,
  },
  {
    label: "Pre-built agent hooks (Claude Code, Codex, …)",
    lpm: "Claude Code, Codex, Gemini, OpenCode",
    competitor: false,
  },
  {
    label: "Embedded browser",
    lpm: "tabs beside terminals",
    competitor: false,
  },
  {
    label: "Native SSH workspaces",
    lpm: "remote projects + port forwarding",
    competitor: "ssh in a shell, with shell integration",
  },
  {
    label: "tmux control mode integration",
    lpm: false,
    competitor: true,
  },
  {
    label: "Triggers, smart selection, scripting API",
    lpm: false,
    competitor: true,
  },
  {
    label: "Years of terminal-emulator polish",
    lpm: "terminal built for running services and agents",
    competitor: true,
  },
  {
    label: "License",
    lpm: "Open source, free",
    competitor: "Open source, free",
  },
  {
    label: "Platforms",
    lpm: "macOS",
    competitor: "macOS",
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is lpm a replacement for iTerm2?",
    answer:
      "For most people, no — and it doesn't need to be. iTerm2 is a terminal emulator; lpm is a project manager that happens to have a terminal inside it. If what you want is a better emulator — triggers, smart selection, tmux control mode, the Python API — iTerm2 is the more capable tool and lpm will not match it. If what you want is to stop hand-starting six services every morning, that is the gap lpm fills.",
  },
  {
    question: "Can I keep using iTerm2 alongside lpm?",
    answer:
      "Yes, and plenty of people do. Let lpm own the project layer — which project is active, what services are running, duplicating a checkout for a second agent — and keep iTerm2 as the terminal you reach for when you want a scratch shell. They don't conflict: lpm starts and stops ordinary native processes, exactly as you would by hand.",
  },
  {
    question: "What does lpm do that iTerm2 can't?",
    answer:
      "Three things, all above the terminal layer. It reads your repo and generates a working config, so starting the whole stack is one click instead of six tabs. It shows live status per service on each tab, so a crashed worker is visible without hunting for it. And it can duplicate a project — as a linked Git worktree or a standalone copy — so a second agent gets its own checkout and its own ports instead of fighting the first one.",
  },
  {
    question: "I only ever work on one repo. Is lpm worth it?",
    answer:
      "Honestly, the gains are smaller. lpm's value scales with how many services you start and how often you switch context. On a single repo with one process, iTerm2 plus a shell alias is a perfectly good setup and you should keep it. The moment you add a second agent working in parallel, or a stack of four services with a database, the project layer starts paying for itself.",
  },
  {
    question: "Is lpm free like iTerm2?",
    answer: (
      <>
        Yes. lpm is free and open source with no paid tier and no commercial
        license to buy, the same as iTerm2. The source is on{" "}
        <a
          href={REPO_URL}
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          GitHub
        </a>{" "}
        if you want to read it before installing.
      </>
    ),
    answerText: `Yes. lpm is free and open source with no paid tier and no commercial license to buy, the same as iTerm2. The source is on GitHub at ${REPO_URL} if you want to read it before installing.`,
  },
];

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: PATH,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Compare", path: VS_BASE_PATH },
    { name: "iTerm2", path: PATH },
  ]),
];

export default function LpmVsIterm2Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <ComparisonHero
        eyebrow="lpm vs iTerm2"
        title="An iTerm2 alternative that manages projects, not just panes."
        description="iTerm2 is the terminal emulator most Mac developers already have open, and it is very good at that job. lpm sits a layer above: it starts and stops your whole stack, shows live status per service, and duplicates a project when a second agent needs its own checkout. Honest side-by-side, including the rows where iTerm2 wins."
      />

      <DemoSection />

      <FeatureMatrix
        title="iTerm2 and lpm, feature by feature"
        description="These tools overlap less than the search results suggest. Rows where iTerm2 wins are called out plainly — it is the better emulator, and lpm does not pretend otherwise."
        competitorName="iTerm2"
        rows={MATRIX_ROWS}
      />

      <WhenToPick
        title="When each one is the right tool"
        description="Both are free, open source, and macOS-only. The split is whether your bottleneck is the terminal itself or everything you have to start inside it."
        lpm={{
          name: "lpm",
          headline:
            "Your friction is starting, stopping, and switching whole projects — not the emulator.",
          points: [
            "You start several services every morning and want one click instead of six tabs.",
            "You want lpm to read your repo and generate a working config rather than writing one by hand.",
            "You run AI coding agents and want a second checkout with its own ports, created as a worktree or a copy.",
            "You want a crashed service to be visible on its tab instead of buried in scrollback.",
            "You bounce between projects and want a visual switcher that remembers what each one runs.",
          ],
        }}
        competitor={{
          name: "iTerm2",
          headline:
            "You want the most capable terminal emulator on macOS, and you want to configure it deeply.",
          points: [
            "You rely on triggers, smart selection, or the scripting API.",
            "You drive tmux through control mode and want it rendered natively.",
            "Your work is one repo with one or two processes, so project juggling isn't the bottleneck.",
            "You have years of muscle memory in your iTerm2 setup and no reason to move it.",
          ],
        }}
      />

      <Faq title="lpm vs iTerm2 — the honest FAQ" items={FAQ_ITEMS} />

      <RelatedPages
        links={[
          {
            href: BEST_TERMINAL_MAC_PATH,
            title: "Best terminal for Mac",
            description:
              "What a native macOS terminal looks like when it also runs your whole dev stack.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "Run AI coding agents next to your services with status on every tab.",
          },
        ]}
      />

      <Cta
        title="Keep iTerm2. Add the project layer."
        description="lpm is free, macOS-native, and starts ordinary processes the same way you would by hand. Install it next to your current setup and see whether the project layer earns its place."
      />
    </>
  );
}
