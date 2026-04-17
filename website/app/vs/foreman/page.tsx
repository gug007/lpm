import type { Metadata } from "next";
import { ComparisonHero } from "@/components/vs/comparison-hero";
import { Cta } from "@/components/vs/cta";
import { Faq, type FaqItem } from "@/components/vs/faq";
import {
  FeatureMatrix,
  type MatrixRow,
} from "@/components/vs/feature-matrix";
import { WhenToPick } from "@/components/vs/when-to-pick";
import { REPO_URL, vsPath } from "@/lib/links";

const PATH = vsPath("foreman");

export const metadata: Metadata = {
  title: "lpm vs Foreman",
  description:
    "A modern Procfile experience for local dev: per-service panes, a desktop app, and multi-project switching. Honest comparison of lpm and Foreman.",
  keywords: [
    "foreman alternative",
    "foreman vs lpm",
    "procfile manager",
    "rails process manager",
    "procfile alternative",
    "modern foreman",
    "rails dev stack",
    "ddollar foreman",
    "foreman start",
    "lpm",
    "local project manager",
  ],
  alternates: { canonical: PATH },
  openGraph: {
    title: "lpm vs Foreman",
    description:
      "Keep the Procfile-style ergonomics, get per-service panes, a desktop app, and multi-project support. Honest look at lpm versus Foreman.",
    type: "website",
    url: PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "lpm vs Foreman",
    description:
      "A modern Procfile experience with per-service panes, a desktop app, and multi-project switching.",
  },
};

const MATRIX_ROWS: MatrixRow[] = [
  {
    label: "Starts a stack with one command",
    lpm: true,
    competitor: true,
  },
  {
    label: "Reads a Procfile-style config",
    lpm: true,
    competitor: true,
  },
  {
    label: "Per-service live output pane",
    lpm: true,
    competitor: false,
  },
  {
    label: "Interleaved color-prefixed logs",
    lpm: "optional",
    competitor: true,
  },
  {
    label: "Native macOS desktop app",
    lpm: true,
    competitor: false,
  },
  {
    label: "Visual project switcher",
    lpm: true,
    competitor: false,
  },
  {
    label: "Manages multiple projects at once",
    lpm: true,
    competitor: false,
  },
  {
    label: "Start, stop, restart individual services",
    lpm: true,
    competitor: "all or nothing",
  },
  {
    label: "Designed for parallel AI coding agents",
    lpm: true,
    competitor: false,
  },
  {
    label: "Duplicate a project for a second agent",
    lpm: true,
    competitor: false,
  },
  {
    label: "Exports systemd / upstart / launchd units",
    lpm: false,
    competitor: "via foreman export",
  },
  {
    label: "Framework auto-detect (Rails, Next.js, Go, Django, Flask, Compose)",
    lpm: true,
    competitor: false,
  },
  {
    label: "CLI + desktop app share the same config",
    lpm: true,
    competitor: "CLI only",
  },
  {
    label: "Open source, free",
    lpm: true,
    competitor: true,
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Can I move to lpm without rewriting my Procfile?",
    answer:
      "Mostly yes. lpm reads a Procfile-style config where each service is a name and a command, so your existing web/worker/css/jobs lines carry over directly. You point lpm at the project, it picks up the services, and you start the stack from the app or the CLI. Framework auto-detection for Rails, Next.js, Go, Django, Flask, and Docker Compose means many projects need no config at all.",
  },
  {
    question: "Does lpm replace foreman export?",
    answer:
      "No. If you use foreman export to generate upstart, systemd, or launchd unit files for deploy, keep using Foreman for that. lpm is focused on the local dev loop — starting the stack on your machine, viewing live output per service, and switching between projects — not on producing init-system artifacts for servers.",
  },
  {
    question: "I have one Rails app and I like interleaved logs. Why switch?",
    answer:
      "You might not need to. If you are a solo Rails dev with one active project and foreman start is all you want, Foreman is great and stays out of your way. lpm starts paying off when you have more than one project, want per-service panes instead of one interleaved stream, want a desktop UI to see what is running without running ps, or want to duplicate a project so a second AI agent can work in parallel.",
  },
  {
    question: "How does lpm help when I run Claude Code or Codex?",
    answer:
      "Each project gets its own entry in the desktop app with live panes per service, so you can point Claude Code at one project and Codex at another — or duplicate a project and run two agents against their own copies of the stack — and still see every service's output at a glance. Foreman was not designed for this; its single interleaved stream and single-project model get noisy fast once multiple agents are touching the same stack.",
  },
  {
    question: "Do I have to pick one? Can lpm and Foreman coexist?",
    answer: (
      <>
        They coexist fine. lpm does not lock a project in — it just starts the
        processes you defined. You can keep <code>foreman export</code> in your
        deploy pipeline, keep a Procfile in the repo, and still drive the local
        stack from lpm when you want panes and project switching. The source
        lives on{" "}
        <a
          href={REPO_URL}
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          GitHub
        </a>{" "}
        if you want to poke around before committing.
      </>
    ),
    answerText: `They coexist fine. lpm does not lock a project in — it just starts the processes you defined. You can keep "foreman export" in your deploy pipeline, keep a Procfile in the repo, and still drive the local stack from lpm when you want panes and project switching. The source lives on GitHub at ${REPO_URL} if you want to poke around before committing.`,
  },
];

export default function LpmVsForemanPage() {
  return (
    <>
      <ComparisonHero
        eyebrow="lpm vs Foreman"
        title="A modern Procfile experience for local dev."
        description="Foreman is stable and lovable for Rails devs. lpm keeps that Procfile-style ergonomics and adds per-service panes, a desktop app, multi-project switching, and parallel AI-agent workflows."
      />

      <FeatureMatrix
        title="Foreman and lpm, feature by feature"
        description="Rows where Foreman wins are called out honestly. No marketing shade — this is the real shape of the overlap."
        competitorName="Foreman"
        rows={MATRIX_ROWS}
      />

      <WhenToPick
        title="When each one is the right tool"
        description="Both manage local processes. The split is about how much surface area you want around them."
        lpm={{
          name: "lpm",
          headline:
            "You work across multiple projects, want per-service panes, or run AI agents in parallel.",
          points: [
            "You juggle several local projects and want a visual switcher instead of terminal tabs and memory.",
            "You want each service — web, workers, CSS, jobs — in its own live pane rather than one interleaved stream.",
            "You run Claude Code, Codex, Cursor, or aider in parallel and need their output visible without tab wrestling.",
            "You want a native macOS desktop app alongside a CLI that shares the same config.",
            "You'd rather duplicate a project than spin up a second worktree by hand when a second agent shows up.",
          ],
        }}
        competitor={{
          name: "Foreman",
          headline:
            "You're a solo Rails dev with one project and all you need is foreman start.",
          points: [
            "One Rails app, one Procfile, one terminal — and you like it that way.",
            "You rely on foreman export to generate upstart, systemd, or launchd units for deploy.",
            "Interleaved color-prefixed logs are actually what you want to read.",
            "Zero UI is a feature, not a missing one, and you live inside tmux or iTerm already.",
            "You don't need multi-project management or parallel AI agents yet.",
          ],
        }}
      />

      <Faq
        title="Switching from Foreman to lpm — the honest FAQ"
        items={FAQ_ITEMS}
      />

      <Cta
        title="Keep the Procfile feel. Add the layer Foreman doesn't."
        description="Same one-command start your stack, plus per-service panes, a desktop app, and multi-project switching. Free and open source."
      />
    </>
  );
}
