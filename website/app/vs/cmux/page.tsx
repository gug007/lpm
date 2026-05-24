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
import { REPO_URL, vsPath } from "@/lib/links";

const PATH = vsPath("cmux");

export const metadata: Metadata = {
  title: "lpm vs cmux",
  description:
    "lpm and cmux both target Mac developers running AI coding agents. Honest side-by-side: lpm manages projects, cmux is the terminal.",
  keywords: [
    "lpm vs cmux",
    "cmux alternative",
    "cmux alternative macos",
    "cmux project manager",
    "terminal for claude code",
    "terminal for codex",
    "manaflow cmux",
    "macos coding agent terminal",
    "lpm",
    "local project manager",
  ],
  alternates: { canonical: PATH },
  openGraph: {
    title: "lpm vs cmux",
    description:
      "Both run on macOS for AI coding agents — lpm manages projects while cmux is the terminal. Honest comparison.",
    type: "website",
    url: PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "lpm vs cmux",
    description:
      "Both run on macOS for AI coding agents — lpm manages projects while cmux is the terminal.",
  },
};

const MATRIX_ROWS: MatrixRow[] = [
  {
    label: "Primary object",
    lpm: "Project (services + agents)",
    competitor: "Workspace (panes + commands)",
  },
  {
    label: "Per-project config",
    lpm: "YAML in ~/.lpm/projects/",
    competitor: "cmux.json in repo",
  },
  {
    label: "Auto-detect stack on init",
    lpm: true,
    competitor: false,
  },
  {
    label: "Start, stop, restart services",
    lpm: true,
    competitor: "via custom workspace commands",
  },
  {
    label: "Duplicate project for parallel agents",
    lpm: true,
    competitor: "via custom commands",
  },
  {
    label: "Run a subset of services (profiles)",
    lpm: true,
    competitor: false,
  },
  {
    label: "One-shot tasks (lint, migrate, seed)",
    lpm: true,
    competitor: "as pane commands",
  },
  {
    label: "Embedded scriptable browser",
    lpm: false,
    competitor: true,
  },
  {
    label: "Native SSH workspaces",
    lpm: false,
    competitor: true,
  },
  {
    label: "Pre-built agent hooks (Claude Code, Codex, Aider, etc.)",
    lpm: "partial",
    competitor: true,
  },
  {
    label: "External socket / control API",
    lpm: false,
    competitor: true,
  },
  {
    label: "CLI + desktop share same config",
    lpm: true,
    competitor: "GUI-first",
  },
  {
    label: "License",
    lpm: "Open source, free",
    competitor: "GPL-3.0 + paid commercial",
  },
  {
    label: "Platforms",
    lpm: "macOS",
    competitor: "macOS",
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Do I have to pick one? Can lpm and cmux coexist?",
    answer:
      "Yes — and it's a reasonable setup. Let lpm own the project layer (which project is active, what services are running, duplicating for a parallel agent). Use cmux as your daily terminal when you want native rendering and the embedded browser. The two configs describe different things and don't conflict.",
  },
  {
    question: "What's the license difference?",
    answer:
      "lpm is open source and free for any use, including inside companies. cmux is GPL-3.0, which means commercial use in an org that can't ship GPL code requires a paid commercial license from Manaflow.",
  },
  {
    question: "Can I migrate a cmux.json to an lpm YAML?",
    answer:
      "There's no automatic converter, but the shapes are close. Each cmux command roughly maps to an lpm service or action. `lpm init` in the repo gives you a starting YAML you can prune to match what your cmux.json was launching.",
  },
  {
    question:
      "Does lpm have an embedded browser or SSH workspaces like cmux?",
    answer: (
      <>
        No to both — if those matter, cmux is the better fit. The source lives
        on{" "}
        <a
          href={REPO_URL}
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          GitHub
        </a>{" "}
        if you want to see what lpm focuses on instead.
      </>
    ),
    answerText: `No to both — if those matter, cmux is the better fit. The source lives on GitHub at ${REPO_URL} if you want to see what lpm focuses on instead.`,
  },
];

export default function LpmVsCmuxPage() {
  return (
    <>
      <ComparisonHero
        eyebrow="lpm vs cmux"
        title="Project manager vs. terminal — both built for coding agents."
        description="cmux is a native macOS terminal built for agents. lpm is a project manager with a built-in terminal. They overlap in the panes-for-agents area, but solve different halves of the workflow. Honest side-by-side, no shade."
      />

      <DemoSection />

      <FeatureMatrix
        title="cmux and lpm, feature by feature"
        description="Rows where cmux wins are called out honestly. No marketing shade — this is the real shape of the overlap."
        competitorName="cmux"
        rows={MATRIX_ROWS}
      />

      <WhenToPick
        title="When each one is the right tool"
        description="Both are macOS-native and OSS. The split is which half of the agent workflow you want the tool to own."
        lpm={{
          name: "lpm",
          headline:
            "You want one switcher that owns starting, stopping, duplicating, and switching whole projects.",
          points: [
            "You bounce between multiple local projects and want a single visual switcher with services + agents already wired up.",
            "You want `lpm init` to read your repo and write a working config instead of writing one by hand.",
            "You want one config that both a CLI and a desktop app understand.",
            "You want a fully free tool with no commercial-license tier.",
            "You rely on duplicating a project to run a second agent in parallel without conflicts.",
          ],
        }}
        competitor={{
          name: "cmux",
          headline:
            "You want a native macOS terminal with agent ergonomics baked in.",
          points: [
            "You want an embedded scriptable browser and native SSH workspaces in the same window.",
            "You want pre-built notification rings and ready-state detection across many agents out of the box.",
            "Your work is one repo at a time, and project juggling isn't your bottleneck.",
            "You're fine writing a cmux.json by hand for each project.",
          ],
        }}
      />

      <Faq title="lpm vs cmux — the honest FAQ" items={FAQ_ITEMS} />

      <Cta
        title="Run your projects, your way."
        description="lpm is free, macOS-native, and pairs cleanly with whatever terminal you love — including cmux. Download and try it next to your current setup."
      />
    </>
  );
}
