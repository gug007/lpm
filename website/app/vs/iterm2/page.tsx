import type { Metadata } from "next";
import Link from "next/link";
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
  CONFIG_PATH,
  MOBILE_PATH,
  PROJECT_SIDEBAR_PATH,
  REPO_URL,
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
import { EmulatorShelf } from "./_components/emulator-shelf";
import { KeepGiveUp } from "./_components/keep-give-up";
import { Matrix } from "./_components/matrix";

const PATH = vsPath("iterm2");

const TITLE = "iTerm2 Alternative for Mac: Projects, Not Just Panes";
const DESCRIPTION =
  "iTerm2 is the better emulator. lpm runs the project instead: one click brings up every service, with Claude Code and Codex in the next tab. Keep both.";

const QUESTION = "Is there a real iTerm2 alternative?";

const PROJECT_FILE = `services:
  storefront: npm run dev
  api: npm run api

profiles:
  frontend: [storefront]`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "iterm2 alternative",
    "iterm alternative",
    "iterm2 alternative mac",
    "iterm2 vs lpm",
    "free iterm2 alternative",
    "iterm2 alternative for claude code",
    "iterm2 vs warp",
    "iterm2 project management",
    "run multiple services in iterm2",
    "mac terminal for multiple projects",
    "iterm2 vs ghostty",
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
    label: "iTerm2",
    title: "Keep iTerm2 for",
    body: "Triggers that fire on output, smart selection, the Python API, tmux control mode, and every keybinding you have tuned over the years.",
  },
  {
    label: "lpm",
    title: "Add lpm for",
    body: "One click that starts four services, a switcher across repos, and a separate checkout per agent.",
  },
  {
    label: "Both",
    title: "Run both",
    body: "lpm starts ordinary processes through your login shell — no container, no wrapper — and the Open in iTerm action drops you into the project directory in your own window whenever you want it.",
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
      "Yes, and plenty of people do. Let lpm own the project layer — which project is active, what services are running, duplicating a checkout for a second agent — and keep iTerm2 as the terminal you reach for when you want a scratch shell. They don't conflict: lpm starts and stops ordinary native processes, exactly as you would by hand. lpm has an Open in iTerm action, so the project directory is one click from your own shell.",
  },
  {
    question: "What does lpm do that iTerm2 cannot?",
    answer: (
      <>
        Three things, and not one of them is about the emulator. It writes the
        service list for you: add the folder and lpm reads package.json, a
        Procfile, a Gemfile, a compose file and the rest, then lists the
        services, with a port wherever the framework or the command names one —
        and Generate with AI hands a redraft to Claude Code, Codex, Gemini CLI or
        OpenCode. It starts every service at once and puts the
        port that service is listening on onto that service&apos;s tab. And it
        copies the project so a second agent works in a checkout of its own
        instead of overwriting the first one&apos;s files — a standalone copy
        brings your ignored files and installed packages along, while{" "}
        <Link
          href={WORKTREE_AGENTS_PATH}
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          a linked worktree starts from the commit, so your .env and node_modules
          do not come with it
        </Link>
        — and either way both copies answer on the same ports and talk to the
        same database.
      </>
    ),
    answerText:
      "Three things, and not one of them is about the emulator. It writes the service list for you: add the folder and lpm reads package.json, a Procfile, a Gemfile, a compose file and the rest, then lists the services, with a port wherever the framework or the command names one — and Generate with AI hands a redraft to Claude Code, Codex, Gemini CLI or OpenCode. It starts every service at once and puts the port that service is listening on onto that service's tab. And it copies the project so a second agent works in a checkout of its own instead of overwriting the first one's files — a standalone copy brings your ignored files and installed packages along, while a linked worktree starts from the commit, so your .env and node_modules do not come with it — and either way both copies answer on the same ports and talk to the same database.",
  },
  {
    question: "How does lpm compare to Warp, Ghostty, or Kitty?",
    answer:
      "Same answer as iTerm2: those are emulators, and lpm is not one. Pick whichever emulator suits you for your own shells — lpm holds the projects and the services either way.",
  },
  {
    question: "Can I run lpm from the iTerm2 command line?",
    answer: (
      <>
        Yes, from an iTerm2 tab like any other shell — but the verbs split in
        two.{" "}
        <code className="font-mono text-[0.9em]">lpm start</code>,{" "}
        <code className="font-mono text-[0.9em]">lpm stop</code>,{" "}
        <code className="font-mono text-[0.9em]">lpm service web restart</code>,{" "}
        <code className="font-mono text-[0.9em]">lpm run</code> and{" "}
        <code className="font-mono text-[0.9em]">lpm duplicate</code> hand the
        work to the app, so lpm has to be open; with it closed they stop and say
        so. <code className="font-mono text-[0.9em]">lpm list</code> and{" "}
        <code className="font-mono text-[0.9em]">lpm logs</code> read your
        running services themselves, so those two answer from a cold shell.{" "}
        <code className="font-mono text-[0.9em]">lpm status</code> reports what
        your agents are doing, which only the app knows, so it needs lpm open
        too.
      </>
    ),
    answerText:
      "Yes, from an iTerm2 tab like any other shell — but the verbs split in two. lpm start, lpm stop, lpm service web restart, lpm run and lpm duplicate hand the work to the app, so lpm has to be open; with it closed they stop and say so. lpm list and lpm logs read your running services themselves, so those two answer from a cold shell. lpm status reports what your agents are doing, which only the app knows, so it needs lpm open too.",
  },
  {
    question: "Do I lose my iTerm2 profiles and keybindings?",
    answer:
      "They do not transfer, and that is a real cost. It is also why the recommendation here is to run both rather than switch.",
  },
];

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: PATH,
    about: [
      "iTerm2 alternatives for macOS",
      "terminal emulator versus project manager",
      "running multiple dev services on a Mac",
      "Claude Code and Codex in a terminal",
    ],
    dateModified: VS_REVIEWED_ISO,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Compare", path: VS_BASE_PATH },
    { name: "iTerm2", path: PATH },
  ]),
  screenRecordingJsonLd("duplicate-project"),
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
        title="An iTerm2 alternative that runs whole projects, not just panes."
        description="iTerm2 is the more capable emulator, and nothing here argues with that. lpm owns the project instead: one click brings up every service, each service tab carries the ports it is listening on, and a second agent gets a checkout of its own."
        verdictLine="Most people should keep iTerm2 and add the project layer."
        jumpHref="#matrix"
        jumpLabel="Jump to the iTerm2 rows"
        downloadSource="vs-iterm2-hero"
      />

      <ComparisonBasis
        reviewed={VS_REVIEWED}
        reviewedIso={VS_REVIEWED_ISO}
        sources={[
          {
            href: "https://iterm2.com/documentation.html",
            label: "iTerm2 documentation",
          },
          {
            href: "https://iterm2.com/python-api/",
            label: "the iTerm2 scripting API docs",
          },
          {
            href: "https://iterm2.com/documentation-tmux-integration.html",
            label: "the iTerm2 tmux integration docs",
          },
          {
            href: "https://iterm2.com/news.html",
            label: "the iTerm2 release notes",
          },
          {
            href: "https://iterm2.com/claude-code-integration.html",
            label: "its Claude Code integration docs",
          },
          {
            href: "https://iterm2.com/documentation-preferences-profiles-terminal.html",
            label: "its scrollback setting",
          },
          {
            href: "https://github.com/gnachman/iTerm2/blob/master/LICENSE",
            label: "iTerm2's licence",
          },
          {
            href: "https://github.com/warpdotdev/Warp",
            label: "Warp's repository",
          },
        ]}
        lpmNote="iTerm2 3.7 shipped on 8 September 2026; the agent-integration row reflects that release."
      />

      <QuickAnswer question={QUESTION}>
        <p>
          If what you want is a better terminal emulator, the honest answers are
          Ghostty, Kitty, WezTerm, Alacritty, Warp — or iTerm2 itself, which
          shipped a major release in September 2026 and is not standing still.
          lpm is not on that shelf.
        </p>
        <p>
          lpm is a free macOS app that manages the projects you run inside a
          terminal. One click starts and stops every service in a project, each
          service tab is labelled with the port that service&apos;s process tree
          is listening on, those services stay up after you quit the app, and a
          second agent can be handed its own checkout — a linked worktree that
          shares the repository, or a standalone copy that carries its own
          history.
        </p>
        <CodeBlock filename="~/Projects/shop/.lpm.yml">{PROJECT_FILE}</CodeBlock>
        <p>
          That file sits in the repo and travels with the branch, so a teammate
          who opens the project gets the same services, alongside whatever lpm
          detected when they added it; if it is only for you,
          the same lines can live in your own project file instead. iTerm2 has no
          equivalent object — its profiles set the shell and the appearance, not
          which services a project runs.{" "}
          <Link
            href={CONFIG_PATH}
            className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
          >
            Every field
          </Link>{" "}
          a project file accepts is in the config reference.
        </p>
      </QuickAnswer>

      <VerdictCards cards={VERDICT_CARDS} />

      <KeepGiveUp />

      <Matrix />

      <EmulatorShelf />

      <SectionVideo
        eyebrow="See it"
        title="The thing a terminal window cannot do"
        description="Copying a project so a second agent gets its own checkout, its own services, and its own terminals."
        clip="duplicate-project"
        label="Duplicating a project in lpm into an independent copy with its own services, terminals, and agents."
      />

      <WhenToPick
        title="When to keep iTerm2 alone, and when to add lpm"
        description="Two free, macOS-only, open-source tools. The split is whether your bottleneck is the emulator itself or everything you have to start inside it."
        lpm={{
          name: "lpm",
          headline:
            "Your friction is starting, stopping, and switching whole projects — not the emulator.",
          points: [
            "You start four services every morning and want one command instead of six tabs.",
            "You want the service list drafted from your repo the moment you add it, instead of typed out by hand.",
            "You run Claude Code or Codex and want each agent in its own checkout, created as a worktree or a standalone copy.",
            "You want one view of everything running across every project, with the ports each service holds.",
            "You want your dev servers to survive quitting the app — without running tmux to get it.",
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

      <DemoSection />

      <Faq title="lpm vs iTerm2 — the honest FAQ" items={FAQ_ITEMS} />

      <RelatedPages
        links={[
          {
            href: PROJECT_SIDEBAR_PATH,
            title: "Terminal with a project sidebar",
            description:
              "Every repo in one list, with what each one is running — the switcher a profile menu is not.",
          },
          {
            href: vsPath("tmux"),
            title: "lpm vs tmux",
            description:
              "Where the control-mode row leads: a live pane per service, with no multiplexer underneath.",
          },
          {
            href: vsPath("cmux"),
            title: "lpm vs cmux",
            description:
              "The other Mac terminal built around coding agents, compared row by row.",
          },
          {
            href: WORKTREE_AGENTS_PATH,
            title: "Git worktrees for AI agents",
            description:
              "How many checkouts you can run at once, and what each one quietly leaves behind.",
          },
          {
            href: CONFIG_PATH,
            title: "Project config reference",
            description:
              "Every key a project file takes: services, dependsOn, profiles, actions, and declared ports.",
          },
          {
            href: MOBILE_PATH,
            title: "Your Mac's terminals on an iPhone",
            description:
              "The lpm Link app mirrors a tab running on the Mac, takes typing, and pings you when Claude Code or Codex needs an answer.",
          },
        ]}
      />

      <Cta
        title="Keep iTerm2. Add the project layer."
        description={
          <>
            lpm is free, macOS-native, MIT-licensed, and starts your services as
            ordinary processes — the same commands you would type by hand.
            Install it beside iTerm2 and see whether the project layer earns its
            place. Read it first on{" "}
            <a
              href={REPO_URL}
              className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
            >
              GitHub
            </a>{" "}
            if you would rather.
          </>
        }
        downloadSource="vs-iterm2-cta"
      />
    </>
  );
}
