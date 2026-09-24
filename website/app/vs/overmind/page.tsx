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
import { Answer } from "./_components/answer";
import { CommandTranslation } from "./_components/command-translation";
import { Differences } from "./_components/differences";
import { Procfile } from "./_components/procfile";
import {
  CONFIG_PATH,
  LINUX_HOST_PATH,
  REPO_URL,
  SSH_TERMINAL_MAC_PATH,
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
import { OVERMIND_DEMO } from "./_components/demo-tour";

const PATH = vsPath("overmind");
const TITLE = "Overmind Alternative for Mac: Procfile in a GUI";
const DESCRIPTION =
  "Overmind runs your Procfile through tmux. lpm runs the same lines as clickable panes in a Mac app with no tmux installed — plus the conversion in full.";

const CODE = "font-mono text-[0.9em]";
const LINK =
  "underline underline-offset-2 hover:text-gray-900 dark:hover:text-white";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "overmind procfile alternative",
    "overmind alternative mac",
    "overmind vs lpm",
    "overmind procfile.dev",
    "procfile gui",
    "procfile runner mac",
    "run procfile without tmux",
    "overmind connect alternative",
    "darthsim overmind",
    "procfile without tmux",
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
    label: "Overmind",
    title: "Keep Overmind",
    body: "-m web=2,worker=3 to scale a process, a PORT stepped per process with \u2011p and \u2011P, Linux and *BSD, and a Procfile it reads fresh on every start.",
  },
  {
    label: "lpm",
    title: "Switch to lpm",
    body: "No tmux to install, a project switcher across repos, dependsOn for start order, and Claude Code or Codex in a tab beside the services.",
  },
  {
    label: "Both",
    title: "Run both",
    body: "Nothing conflicts. lpm never touches your Procfile or your .overmind.env, so the Overmind workflow you already have keeps working.",
  },
];

const FAQS: FaqItem[] = [
  {
    question: "Do I have to throw away my Procfile?",
    answer: (
      <>
        No. lpm imports it when the project is added — one service per line,
        same names — and leaves the file as it was for Heroku or Foreman. From
        then on lpm starts from{" "}
        <Link href={CONFIG_PATH} className={LINK}>
          its own service list
        </Link>
        , so a Procfile change made later does not carry over by itself.
      </>
    ),
    answerText:
      "No. lpm imports it when the project is added — one service per line, same names — and leaves the file as it was for Heroku or Foreman. From then on lpm starts from its own service list, so a Procfile change made later does not carry over by itself.",
  },
  {
    question: "Does lpm need tmux?",
    answer: (
      <>
        No. lpm{" "}
        <Link href={vsPath("tmux")} className={LINK}>
          does not use tmux
        </Link>{" "}
        and never asks you to install it. Your services keep running when you
        quit lpm and they are there when you reopen it — nothing to attach to.
      </>
    ),
    answerText:
      "No. lpm does not use tmux and never asks you to install it. Your services keep running when you quit lpm and they are there when you reopen it — nothing to attach to.",
  },
  {
    question: "How do I attach to one process the way overmind connect does?",
    answer:
      "You do not, and this is the clearest thing Overmind does that lpm does not. Clicking a service brings up its pane with 10,000 lines of scrollback, but that pane is read-only: there is no prompt to type at, so a pry or byebug session inside a running process is an Overmind job. What lpm gives you instead is restarting that one process without touching the others, and reading its output back from the app or with lpm logs.",
  },
  {
    question: "Does lpm assign each process a PORT like Overmind?",
    answer: (
      <>
        No. In lpm <code className={CODE}>port:</code> is a label used to check
        for conflicts before a start and to name the process holding one; you
        still export <code className={CODE}>PORT</code> yourself. If automatic
        assignment is what keeps your Procfile portable, that is a real reason to
        stay on Overmind.
      </>
    ),
    answerText:
      "No. In lpm port: is a label used to check for conflicts before a start and to name the process holding one; you still export PORT yourself. If automatic assignment is what keeps your Procfile portable, that is a real reason to stay on Overmind.",
  },
  {
    question: "Overmind, Foreman or lpm — where does each fit?",
    answer: (
      <>
        <Link href={vsPath("foreman")} className={LINK}>
          Foreman
        </Link>{" "}
        interleaves one log stream in a single terminal. Overmind gives each
        process a tmux window you can attach to. lpm gives each one a pane in a
        Mac app, plus a project switcher and a service list you can commit.
      </>
    ),
    answerText:
      "Foreman interleaves one log stream in a single terminal. Overmind gives each process a tmux window you can attach to. lpm gives each one a pane in a Mac app, plus a project switcher and a service list you can commit.",
  },
  {
    question: "Can I use lpm on a remote dev box?",
    answer: (
      <>
        Two ways: attach it as an{" "}
        <Link href={SSH_TERMINAL_MAC_PATH} className={LINK}>
          SSH project
        </Link>
        , so its services get panes beside your local ones with ports forwarded
        to localhost, or{" "}
        <Link href={LINUX_HOST_PATH} className={LINK}>
          pair a Linux machine
        </Link>{" "}
        as a headless host and drive it from the Mac app.
      </>
    ),
    answerText:
      "Two ways: attach it as an SSH project, so its services get panes beside your local ones with ports forwarded to localhost, or pair a Linux machine as a headless host and drive it from the Mac app.",
  },
];

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: PATH,
    about: [
      "Overmind alternative for macOS",
      "Procfile process runners",
      "per-service terminal panes",
      "running a Procfile without tmux",
    ],
    dateModified: VS_REVIEWED_ISO,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Compare", path: VS_BASE_PATH },
    { name: "Overmind", path: PATH },
  ]),
  screenRecordingJsonLd("start-project"),
];

export default function OvermindVsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <ComparisonHero
        eyebrow="lpm vs Overmind"
        title="An Overmind alternative for Mac — your Procfile as live panes, no tmux."
        description="Overmind runs each Procfile line as a tmux window and asks you to install tmux first. lpm imports the same named commands and runs them as panes in a Mac app: click one to read its output, stop or restart one without the rest, start them in dependsOn order."
        verdictLine="Five rows go to Overmind. If any of them is load-bearing for you, stay where you are."
        jumpHref="#procfile"
        jumpLabel="See the Procfile conversion"
        downloadSource="vs-overmind-hero"
      />

      <ComparisonBasis
        reviewed={VS_REVIEWED}
        reviewedIso={VS_REVIEWED_ISO}
        sources={[
          {
            href: "https://github.com/DarthSim/overmind#readme",
            label: "Overmind's own README",
          },
          {
            href: "https://github.com/DarthSim/overmind/releases",
            label: "its releases page",
          },
          {
            href: "https://github.com/ddollar/foreman/blob/master/man/foreman.1.ronn",
            label: "Foreman's man page",
          },
          {
            href: "https://man.openbsd.org/tmux.1",
            label: "tmux's manual page",
          },
        ]}
        lpmNote="Overmind's flags and commands here all come from its README, the Foreman line from its man page, and the detach behaviour from tmux's. lpm's own rows were re-read in the app source the same day, after lpm began importing Procfiles."
      />

      <Answer />

      <VerdictCards cards={VERDICT_CARDS} />

      <Procfile />

      <SectionVideo
        eyebrow="See it"
        title="Every process, its own live pane"
        description="What overmind start produces in tmux windows, produced instead as panes you click."
        clip="start-project"
        label="Starting a project in lpm — every process in the config comes up in its own live pane."
      />

      <Differences />

      <CommandTranslation />

      <WhenToPick
        title="Pick the tool that matches how you actually work"
        lpm={{
          name: "lpm",
          headline:
            "You want a GUI, multiple projects open at once, and room for AI agents.",
          points: [
            "You switch between two or more local projects during the day and want a visual sidebar, not separate terminal windows.",
            "You point Claude Code, Codex, Gemini CLI, or OpenCode at the same stack and want each agent's output in its own pane beside the services it is breaking.",
            "You would rather not install tmux to run a Rails or Next.js stack.",
            "Reading a service's last 10,000 lines and restarting just that one is enough — you do not need to type at the process itself.",
            "You want the stack startable by someone who has never opened a multiplexer — the panes are already there when the project starts.",
            "You want one prompt tried three ways: lpm copies the project up to 50 times and starts an agent in each — separate checkouts, so no two agents edit one file, but the same declared ports and the same database underneath, and a linked worktree starts with no .env, and with no node_modules unless you tick Install dependencies.",
          ],
        }}
        competitor={{
          name: "Overmind",
          headline:
            "You live in tmux, stay on the CLI, and want native Procfile features.",
          points: [
            "You already have tmux muscle memory and prefer keyboard-driven window management.",
            "You develop over SSH on a remote box, where a dropped connection leaves the tmux session running and overmind connect picks the process back up.",
            "You use overmind start -m web=2,worker=3, or you rely on Overmind handing each process a PORT.",
            "Your workflow is one project at a time and you're happy driving everything from the shell.",
            "Your team develops on Linux or *BSD as well as macOS.",
          ],
        }}
      />

      <DemoSection {...OVERMIND_DEMO} />

      <Faq title="Switching from Overmind" items={FAQS} />

      <RelatedPages
        links={[
          {
            href: vsPath("tmux"),
            title: "lpm vs tmux",
            description:
              "Persistent panes without a .tmux.conf — what survives a restart on each side, and what does not.",
          },
          {
            href: vsPath("foreman"),
            title: "lpm vs Foreman",
            description:
              "The original Procfile runner: one interleaved stream, its -m formation flag, and what changes when each process gets a pane.",
          },
          {
            href: CONFIG_PATH,
            title: "Config reference",
            description:
              "Every key a service takes — cmd, cwd, port, env, dependsOn — and the profiles that start a subset.",
          },
          {
            href: SSH_TERMINAL_MAC_PATH,
            title: "SSH terminal for Mac",
            description:
              "Pick a host from your SSH config, give its processes their own panes, and forward a port when you need one.",
          },
          {
            href: LINUX_HOST_PATH,
            title: "Run agents on a Linux box",
            description:
              "Pair a Linux machine as a headless host, then drive its services and its agents from the Mac app.",
          },
          {
            href: WORKTREE_AGENTS_PATH,
            title: "A checkout per agent",
            description:
              "What lpm duplicate -n 3 actually creates, and the ignored files a linked worktree leaves behind.",
          },
        ]}
      />

      <Cta
        title="Your Procfile, as panes you can click."
        description={
          <>
            lpm converts the lines as you add the folder. Each process opens as
            a pane you can click, stop or restart without the rest, and read
            10,000 lines back — with no tmux installed anywhere. Free and open source on{" "}
            <a href={REPO_URL} className={LINK}>
              GitHub
            </a>
            .
          </>
        }
        downloadSource="vs-overmind-cta"
      />
    </>
  );
}
