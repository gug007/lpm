import type { Metadata } from "next";
import { CodeBlock } from "@/components/config/code-block";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import { ComparisonBasis } from "@/components/vs/comparison-basis";
import { ComparisonHero } from "@/components/vs/comparison-hero";
import { Cta } from "@/components/vs/cta";
import { Faq, type FaqItem } from "@/components/vs/faq";
import { QuickAnswer } from "@/components/vs/quick-answer";
import { VS_REVIEWED, VS_REVIEWED_ISO } from "@/components/vs/reviewed";
import { SectionVideo } from "@/components/vs/section-video";
import { VerdictCards, type VerdictCard } from "@/components/vs/verdict-cards";
import { WhenToPick } from "@/components/vs/when-to-pick";
import {
  AI_AGENTS_PATH,
  CONNECT_AGENTS_PATH,
  MOBILE_PATH,
  REVIEW_CHANGES_PATH,
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
import FanOut from "./_components/fan-out";
import Matrix from "./_components/matrix";
import Migrate from "./_components/migrate";
import { CMUX_DEMO } from "./_components/demo-tour";

const PATH = vsPath("cmux");

const TITLE = "cmux Alternative for Claude Code & Codex";
const DESCRIPTION =
  "cmux gives Claude Code and Codex a scriptable Mac terminal. lpm adds the project around them: services, per-tab agent status, and 1–50 parallel copies.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "cmux alternative",
    "cmux alternative mac",
    "cmux vs lpm",
    "manaflow cmux",
    "is cmux open source",
    "parallel claude code agents",
    "run multiple codex agents",
    "claude code agent manager",
    "run multiple claude code agents at once",
    "agent terminal macos",
    "claude code multiple projects",
    "does cmux use tmux",
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

const QUICK_ANSWER_QUESTION =
  "Is there a cmux alternative that also runs my dev services?";

const VERDICT_CARDS: [VerdictCard, VerdictCard, VerdictCard] = [
  {
    label: "cmux",
    title: "The terminal",
    body: "Vertical tabs with branch and PR status, split panes, a browser pane a script can snapshot and click, cmux ssh for a remote workspace, and a socket API over all of it.",
  },
  {
    label: "lpm",
    title: "The project",
    body: "Start the stack, check the ports, fan one prompt out to 50 copies, and read working, needs you, done or a problem off each Claude Code or Codex tab.",
  },
  {
    label: "Both",
    title: "Run both",
    body: "They configure different things and neither reads the other's config. Many people keep cmux as the terminal and let lpm own which project is up.",
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is cmux?",
    answer:
      "A native macOS terminal from Manaflow built around AI coding agents: vertical tabs showing branch and PR status, split panes, a notification panel, a scriptable browser pane, and a CLI plus Unix socket to control all of it. It renders through libghostty and reads your Ghostty config for themes and fonts.",
  },
  {
    question: "Is cmux free and open source?",
    answer:
      "Yes. cmux ships under GPL-3.0-or-later; its repository adds that commercial terms may be available where the GPL will not do, and that a paid Founder's Edition buys early access to features still in progress. lpm is MIT and has nothing to buy. Cost is not the reason to choose between them.",
  },
  {
    question: "Can I run several Claude Code or Codex agents at once?",
    answer:
      "In cmux each agent gets its own tab, so two agents in the same folder still edit the same files. lpm splits the repo first — up to 50 copies at a time, each one a linked worktree on a branch of its own or a full folder copy that keeps its Git history — and queues the same prompt in every copy, with working, needs you, done or a problem on the agent tab that owns it. What the copies still share is ports and databases.",
  },
  {
    question: "Can lpm and cmux run side by side?",
    answer:
      "Yes, and it is a reasonable setup. cmux configures your terminal; lpm describes your projects. Neither reads the other's config.",
  },
  {
    question: "How do I move a cmux setup to lpm?",
    answer:
      "There is nothing to convert: cmux.json describes your terminal, not your stack. Add the folder in lpm and it lists the services it finds in the repo — package.json scripts, a Procfile or Gemfile, compose files — for you to prune, with Generate with AI in the config editor if you want another draft. A command you kept as a cmux action becomes an lpm action: one click, or lpm run.",
  },
  {
    question: "Does lpm need tmux?",
    answer:
      "No — and cmux does not need it either. lpm never puts your services inside tmux and does not require it on the machine: the services keep running when you quit lpm, reopening the app picks them up again, and there is no .tmux.conf anywhere in that.",
  },
];

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: PATH,
    about: [
      "cmux alternatives",
      "parallel Claude Code agents",
      "parallel Codex agents",
      "AI agent terminal for macOS",
      "project-level service control",
    ],
    dateModified: VS_REVIEWED_ISO,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Compare", path: VS_BASE_PATH },
    { name: "cmux", path: PATH },
  ]),
  screenRecordingJsonLd("agent-duplicate-fanout"),
];

export default function LpmVsCmuxPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <ComparisonHero
        eyebrow="cmux alternative · macOS"
        title="A cmux alternative that runs Claude Code and Codex on whole projects."
        description="cmux is a programmable terminal for agents. lpm is the project they work in: it starts the services, checks the ports, and can split the repo so each Claude Code or Codex session edits its own checkout."
        verdictLine="cmux owns the terminal. lpm owns the project the agents run inside."
        jumpHref="#matrix"
        jumpLabel="Jump to the row-by-row table"
        downloadSource="vs-cmux-hero"
      />

      <ComparisonBasis
        reviewed={VS_REVIEWED}
        reviewedIso={VS_REVIEWED_ISO}
        sources={[
          { href: "https://cmux.com/docs", label: "cmux's documentation" },
          {
            href: "https://cmux.com/docs/configuration",
            label: "its configuration reference",
          },
          {
            href: "https://github.com/manaflow-ai/cmux",
            label: "the cmux repository",
          },
        ]}
        lpmNote="Every cmux row traces to those three; lpm's own rows were read back out of the app's source that day. Tell us what has drifted."
      />

      <QuickAnswer question={QUICK_ANSWER_QUESTION}>
        <p>
          cmux and lpm both give Claude Code and Codex a native window on the
          Mac, and they draw the line in different places. cmux is the terminal:
          vertical tabs showing branch and PR status, split panes, a browser
          pane that scripts can click through, and a Unix socket that can create
          workspaces and read the screen. lpm is the project: it starts and
          stops the services the agent needs, checks the declared ports first,
          and splits the repo before the agents start — a linked worktree
          branched off the current commit, or a straight copy of the folder
          that keeps its own Git history — so nothing one agent writes
          lands on top of another&apos;s work.
        </p>
        <p>
          Both are free to use and macOS-only, and their configs describe
          different things, so running both is a normal setup rather than a
          compromise.
        </p>
        <CodeBlock filename="Three agents, one prompt">
          {`lpm start api
lpm worktree api --count 3 --run claude --prompt "fix the flaky auth test"
lpm status --json`}
        </CodeBlock>
      </QuickAnswer>

      <VerdictCards cards={VERDICT_CARDS} />

      <FanOut />

      <SectionVideo
        eyebrow="See it"
        title="One prompt, three project copies"
        description="Duplicate fans the project out and starts an agent in each copy, all from one prompt."
        clip="agent-duplicate-fanout"
        label="Three project copies in lpm, each running its own Claude Code agent on the same prompt."
      />

      <Matrix />

      <Migrate />

      <WhenToPick
        eyebrow="Which one to pick"
        title="Terminal-first, or project-first"
        description="Both are macOS-native and open source. The split is which half of the agent workflow you want the tool to own."
        lpm={{
          name: "lpm",
          headline:
            "You want one switcher that owns starting, stopping, duplicating, and switching whole projects.",
          points: [
            "You want the whole project to come up with the agent: services, profiles, a port check at start, and a diff pane before you keep anything.",
            "You keep several repos in play at once and want one window that already knows each one's services and which agents are busy in it.",
            "You want lpm to list the services as the repo is added, with an agent CLI on hand for a second draft.",
            "You want the services in a file the branch carries, so a teammate on that branch gets the same stack.",
            "You fan one prompt out to several copies of the repo, each agent on its own checkout.",
          ],
        }}
        competitor={{
          name: "cmux",
          headline:
            "You want a native macOS terminal with agent ergonomics baked in.",
          points: [
            "You want the terminal itself to be programmable: vertical tabs, splits, a browser pane your scripts can click through, and cmux.json behind all of it.",
            "You want libghostty rendering, and your Ghostty theme and font to carry over.",
            "Your work is one repo at a time, and project juggling isn't your bottleneck.",
          ],
        }}
      />

      <DemoSection {...CMUX_DEMO} />

      <Faq title="Questions about cmux and lpm" items={FAQ_ITEMS} />

      <RelatedPages
        links={[
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "Agent terminals side by side, and what each one hands a running agent.",
          },
          {
            href: WORKTREE_AGENTS_PATH,
            title: "Git worktrees for AI agents",
            description:
              "One agent per branch, and the ignored files a fresh checkout never brings along.",
          },
          {
            href: CONNECT_AGENTS_PATH,
            title: "Connect AI agents to your projects",
            description:
              "Hand Claude Code and Codex a CLI that starts services, reads logs, and fans out copies.",
          },
          {
            href: REVIEW_CHANGES_PATH,
            title: "Review changes before you commit",
            description:
              "Read what an agent wrote file by file, beside the services it was working against.",
          },
          {
            href: vsPath("iterm2"),
            title: "lpm vs iTerm2",
            description:
              "The same split, weighed against the emulator you may already keep open all day.",
          },
          {
            href: MOBILE_PATH,
            title: "lpm on your iPhone",
            description:
              "Open a terminal tab running on your Mac, type into it, and get a push when Claude Code or Codex is waiting on you.",
          },
        ]}
      />

      <Cta
        title="Run your projects, your way."
        description="lpm is free under MIT and macOS-only. Add a repo, let lpm list its services, and keep cmux open beside it."
        downloadSource="vs-cmux-cta"
      />
    </>
  );
}
