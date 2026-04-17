import type { Metadata } from "next";
import { ComparisonHero } from "@/components/vs/comparison-hero";
import { FeatureMatrix, type MatrixRow } from "@/components/vs/feature-matrix";
import { WhenToPick } from "@/components/vs/when-to-pick";
import { Faq, type FaqItem } from "@/components/vs/faq";
import { Cta } from "@/components/vs/cta";
import { REPO_URL, vsPath } from "@/lib/links";

const PATH = vsPath("overmind");

export const metadata: Metadata = {
  title: "lpm vs Overmind",
  description:
    "Overmind-grade per-process control without tmux. lpm gives Rails devs live panes, single-service restarts, and multi-project switching in a macOS app and CLI.",
  keywords: [
    "overmind alternative",
    "overmind vs lpm",
    "procfile manager",
    "tmux alternative rails",
    "rails process manager",
    "foreman overmind lpm",
    "procfile gui",
    "per-process dev server",
    "rails dev environment",
    "macOS process manager",
  ],
  alternates: { canonical: PATH },
  openGraph: {
    title: "lpm vs Overmind",
    description:
      "Overmind-grade per-process control without tmux. A desktop app plus CLI with per-service panes, single-service restarts, and multi-project switching.",
    type: "website",
    url: PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "lpm vs Overmind",
    description:
      "Overmind-grade per-process control without tmux. Per-service panes, single-service restarts, multi-project switching — app and CLI.",
  },
};

const MATRIX_ROWS: MatrixRow[] = [
  {
    label: "Native desktop GUI",
    lpm: true,
    competitor: false,
  },
  {
    label: "Per-service live output",
    lpm: "app panes",
    competitor: "tmux windows",
  },
  {
    label: "Attach to a single process",
    lpm: "click a pane",
    competitor: "overmind connect",
  },
  {
    label: "Restart one service without the rest",
    lpm: true,
    competitor: true,
  },
  {
    label: "Proper SIGINT / signal propagation",
    lpm: true,
    competitor: true,
  },
  {
    label: "Requires tmux",
    lpm: false,
    competitor: true,
  },
  {
    label: "Session survives terminal restart",
    lpm: "partial",
    competitor: "via tmux",
  },
  {
    label: "Remote dev over SSH",
    lpm: false,
    competitor: true,
  },
  {
    label: "Multi-project sidebar and switcher",
    lpm: true,
    competitor: false,
  },
  {
    label: "Parallel AI coding agents per project",
    lpm: true,
    competitor: false,
  },
  {
    label: "Framework auto-detect (Rails, Next.js, Go, Docker)",
    lpm: true,
    competitor: false,
  },
  {
    label: "Single static Go binary footprint",
    lpm: false,
    competitor: true,
  },
];

const FAQS: FaqItem[] = [
  {
    question: "I already have a Procfile for Overmind — do I have to throw it away?",
    answer:
      "No. If your project has a Procfile, lpm reads the same process list — web, worker, css, whatever you've got. You don't need to rewrite anything to try lpm; point it at the repo and every line of the Procfile shows up as its own pane.",
  },
  {
    question: "Does lpm require tmux?",
    answer:
      "No. Overmind is a tmux wrapper by design — the whole point is that each process lives in a tmux window. lpm does not use tmux at all. Each service gets a pane inside the macOS app (or a CLI stream) with its own scrollback, without a tmux server running in the background.",
  },
  {
    question: "How do I attach to a single process the way overmind connect does?",
    answer:
      "Click the service in the sidebar and its pane takes focus with full scrollback and an interactive prompt, so you can hit a debugger, run a pry session, or send input to just that one process. From the CLI you can stream a single service's output the same way.",
  },
  {
    question: "Can I use lpm on a remote dev box over SSH?",
    answer:
      "Not as a first-class workflow. The desktop app is macOS-native and local. If you're doing remote development over SSH and need session persistence across terminal reconnects, Overmind on top of tmux is still a better fit — the tmux server keeps running on the remote host. lpm is aimed at local dev on your own machine.",
  },
  {
    question: "What does lpm add if I'm running Claude Code or Codex alongside my Rails stack?",
    answer:
      "lpm treats each project as a group of services with its own sidebar entry, so you can run Claude Code against one project's running web + worker while Codex hits another — every agent's output visible at once in separate panes, with no tab juggling and no port collisions between projects.",
  },
];

export default function OvermindVsPage() {
  return (
    <>
      <ComparisonHero
        eyebrow="lpm vs Overmind"
        title="Overmind-grade per-process control, without tmux."
        description="Overmind is a great Procfile runner if you live in tmux. lpm gives you the same single-service attach, restart, and signal behavior — in a native macOS app and CLI, with multi-project switching built in."
      />

      <FeatureMatrix
        title="Where the two tools differ"
        description="Overmind is a small, sharp tool built on tmux. lpm is broader — a desktop app plus CLI designed for juggling several local projects at once. Both handle a Procfile; the workflow around it is what changes."
        competitorName="Overmind"
        rows={MATRIX_ROWS}
      />

      <WhenToPick
        title="Pick the tool that matches how you actually work"
        lpm={{
          name: "lpm",
          headline: "You want a GUI, multiple projects open at once, and room for AI agents.",
          points: [
            "You switch between two or more local projects during the day and want a visual sidebar, not separate terminal windows.",
            "You run Claude Code, Codex, Cursor, or aider against the same codebase and want each agent's services visible without context-switching.",
            "You don't want to install or learn tmux just to run a Rails or Next.js stack.",
            "You like the idea of clicking a service to attach to its pane with full scrollback and an interactive prompt.",
            "Your whole team isn't on tmux and you want something a new hire can open on day one.",
          ],
        }}
        competitor={{
          name: "Overmind",
          headline: "You live in tmux, stay on the CLI, and want a tiny single binary.",
          points: [
            "You already have tmux muscle memory and prefer keyboard-driven window management.",
            "You develop over SSH on a remote box and need the tmux server to survive terminal reconnects.",
            "You want a single static Go binary with no GUI dependencies and nothing else running in the background.",
            "Your workflow is one project at a time and you're happy driving everything from the shell.",
            "You're already using Tmuxinator or a custom tmux setup and Overmind slots in cleanly.",
          ],
        }}
      />

      <Faq title="Switching from Overmind" items={FAQS} />

      <Cta
        title="Keep the Procfile. Drop the tmux dependency."
        description={
          <>
            Install lpm, point it at a repo with a Procfile, and every process shows up as its own live pane — in the app or the CLI. Free and open source on{" "}
            <a
              href={REPO_URL}
              className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
            >
              GitHub
            </a>
            .
          </>
        }
      />
    </>
  );
}
