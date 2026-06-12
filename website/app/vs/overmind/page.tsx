import type { Metadata } from "next";
import Link from "next/link";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import { ComparisonHero } from "@/components/vs/comparison-hero";
import { FeatureMatrix, type MatrixRow } from "@/components/vs/feature-matrix";
import { WhenToPick } from "@/components/vs/when-to-pick";
import { Faq, type FaqItem } from "@/components/vs/faq";
import { Cta } from "@/components/vs/cta";
import {
  CONFIG_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  REPO_URL,
  VS_BASE_PATH,
  vsPath,
} from "@/lib/links";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/structured-data";

const PATH = vsPath("overmind");

export const metadata: Metadata = {
  title: "lpm vs Overmind",
  description:
    "Overmind-grade per-process control — no tmux to install or learn. lpm gives Rails devs live panes, single-service restarts, and multi-project switching in a native macOS app.",
  keywords: [
    "overmind alternative",
    "overmind vs lpm",
    "procfile manager",
    "rails process manager",
    "procfile gui",
    "per-process dev server",
  ],
  alternates: { canonical: PATH },
  openGraph: {
    title: "lpm vs Overmind",
    description:
      "Overmind-grade per-process control — no tmux to install or learn. A native macOS desktop app with per-service panes, single-service restarts, and multi-project switching.",
    type: "website",
    url: PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "lpm vs Overmind",
    description:
      "Overmind-grade per-process control — no tmux to install or learn. Per-service panes, single-service restarts, multi-project switching — in a native macOS app.",
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
    label: "Requires installing and learning tmux",
    lpm: false,
    competitor: true,
  },
  {
    label: "Session survives terminal restart",
    lpm: true,
    competitor: true,
  },
  {
    label: "Remote dev over SSH",
    lpm: "remote projects + port forwarding",
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
    label: "Generates project config from your repo",
    lpm: true,
    competitor: false,
  },
];

const FAQS: FaqItem[] = [
  {
    question: "I already have a Procfile for Overmind — do I have to throw it away?",
    answer: (
      <>
        You&apos;ll convert the lines, but the shape is the same. lpm keeps
        each project in a{" "}
        <Link
          href={CONFIG_PATH}
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          small per-project config file
        </Link>{" "}
        you can read, edit, and commit — each service is just a name and a
        command, exactly like your Procfile. Keep the Procfile in the repo if
        Foreman or Heroku still needs it; lpm just reads its own config
        alongside.
      </>
    ),
    answerText:
      "You'll convert the lines, but the shape is the same. lpm keeps each project in a small per-project config file you can read, edit, and commit — each service is just a name and a command, exactly like your Procfile. Keep the Procfile in the repo if Foreman or Heroku still needs it; lpm just reads its own config alongside.",
  },
  {
    question: "Does lpm require tmux?",
    answer:
      "No. Your services run in persistent sessions that survive app and terminal restarts, and each one renders in its own pane in the desktop app — there's nothing to install, configure, or attach to. The difference from Overmind is that you don't write a .tmux.conf, memorize keybindings, or attach to windows by hand; you just click a pane.",
  },
  {
    question: "How do I attach to a single process the way overmind connect does?",
    answer:
      "Click the service in the sidebar and its pane takes focus with full scrollback and an interactive prompt, so you can hit a debugger, run a pry session, or send input to just that one process.",
  },
  {
    question: "Can I use lpm on a remote dev box over SSH?",
    answer:
      "Yes — lpm supports SSH remote projects: connect to a dev box, run its services in panes beside your local ones, and forward remote ports to localhost from the app. If your entire session lives on the remote host and you only ever reach it from a terminal, Overmind on top of a remote multiplexer still fits that shape; lpm gives you the remote box managed from a local desktop app.",
  },
  {
    question: "What does lpm add if I'm running Claude Code or Codex alongside my Rails stack?",
    answer:
      "lpm treats each project as a group of services with its own sidebar entry, so you can run Claude Code against one project's running web + worker while Codex hits another — every agent's output visible at once in separate panes, with no tab juggling and no port collisions between projects.",
  },
];

const structuredData = [
  webPageJsonLd({
    title: "lpm vs Overmind",
    description:
      "Overmind-grade per-process control — no tmux to install or learn. lpm gives Rails devs live panes, single-service restarts, and multi-project switching in a native macOS app.",
    path: PATH,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Compare", path: VS_BASE_PATH },
    { name: "Overmind", path: PATH },
  ]),
];

export default function OvermindVsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <ComparisonHero
        eyebrow="lpm vs Overmind"
        title="Overmind-grade per-process control, in a desktop app."
        description="Overmind is a great Procfile runner that asks you to know tmux. lpm gives you the same single-service attach, restart, and signal behavior — plus a native macOS app, multi-project switching, and project configs generated straight from your repo."
      />

      <DemoSection />

      <FeatureMatrix
        title="Where the two tools differ"
        description="Overmind exposes tmux windows and asks you to drive them. lpm gives you the same per-process control in a desktop app and multi-project sidebar — nothing to install, configure, or attach to."
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

      <RelatedPages
        links={[
          {
            href: MAC_TERMINAL_DEVELOPERS_PATH,
            title: "Mac terminal for developers",
            description:
              "Run your whole stack — services, logs, and agents — in one native Mac app.",
          },
          {
            href: vsPath("foreman"),
            title: "lpm vs Foreman",
            description:
              "How lpm compares to the original Procfile runner for Rails devs.",
          },
        ]}
      />

      <Cta
        title="Keep Overmind's per-process control. Skip the tmux."
        description={
          <>
            Install lpm, convert your Procfile lines into a small per-project config, and every service shows up as its own live pane in the desktop app. Sessions persist across app and terminal restarts — nothing to attach to. Free and open source on{" "}
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
