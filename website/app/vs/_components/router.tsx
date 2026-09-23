import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import {
  AI_AGENTS_PATH,
  BEST_TERMINAL_MAC_PATH,
  CONFIG_PATH,
  SSH_TERMINAL_MAC_PATH,
  vsPath,
  type VsSlug,
} from "@/lib/links";

type Card = {
  slug: VsSlug;
  name: string;
  what: ReactNode;
  switchIf: ReactNode;
  stayIf: ReactNode;
  extra?: ReactNode;
};

type Group = {
  prompt: string;
  cards: Card[];
};

const LINK = "underline underline-offset-2 hover:text-gray-900 dark:hover:text-white";

const GROUPS: Group[] = [
  {
    prompt: "You run each process in its own terminal tab",
    cards: [
      {
        slug: "iterm2",
        name: "iTerm2",
        what: "A Mac terminal emulator with a deep configuration surface: triggers, smart selection, a Python API, tmux control mode.",
        switchIf:
          "you retype the same four commands in four tabs every morning.",
        stayIf: (
          <>
            you want a terminal emulator.{" "}
            <Link href={BEST_TERMINAL_MAC_PATH} className={LINK}>
              lpm ships its own
            </Link>
            , and its Open in iTerm action hands the project directory straight
            to yours.
          </>
        ),
      },
    ],
  },
  {
    prompt: "You have a .tmux.conf or a tmuxinator file",
    cards: [
      {
        slug: "tmux",
        name: "tmux",
        what: "A multiplexer: panes and sessions that survive a disconnect.",
        switchIf: (
          <>
            your config exists mostly to lay out <code>rails s</code>,{" "}
            <code>npm dev</code> and a worker.
          </>
        ),
        stayIf: (
          <>
            what you attach to lives on{" "}
            <Link href={SSH_TERMINAL_MAC_PATH} className={LINK}>
              a server you keep open from every machine you use
            </Link>
            . lpm does not need tmux installed, and does not use it — which
            also means there is nothing on that box for you to attach to.
          </>
        ),
      },
    ],
  },
  {
    prompt: "You have a Procfile",
    cards: [
      {
        slug: "foreman",
        name: "Foreman",
        what: (
          <>
            The Procfile classic: one command, every process interleaved into
            one stream, and <code>foreman export</code> for launchd, systemd and
            five other init formats.
          </>
        ),
        switchIf:
          "one interleaved stream stopped being readable at four processes.",
        stayIf: (
          <>
            one Rails app in one terminal suits you, or your deploy depends on{" "}
            <code>foreman export</code>, or the Procfile is a file you keep
            editing: lpm lifts its lines in once, as you add the folder, and
            later edits stay on Foreman&apos;s side.
          </>
        ),
      },
      {
        slug: "overmind",
        name: "Overmind",
        what: (
          <>
            A Procfile runner built on tmux — <code>overmind connect</code>{" "}
            attaches one process, <code>overmind restart</code> bounces one.
          </>
        ),
        switchIf:
          "you want that per-process control with no multiplexer to install under it.",
        stayIf: (
          <>
            you need Linux or *BSD, <code className="whitespace-nowrap">-m web=2,worker=3</code> scaling, or a
            PORT handed to each process.
          </>
        ),
      },
    ],
  },
  {
    prompt: "You have a compose file",
    cards: [
      {
        slug: "docker-compose",
        name: "Docker Compose",
        what: "Containers that reproduce the stack on any machine, with pinned image versions and its own network namespace.",
        switchIf:
          "your inner loop is application code and the container boundary is buying you nothing on the laptop.",
        stayIf: (
          <>
            production parity matters, someone on the team is on Linux, or a
            dependency nobody wants to install natively. Add the folder and lpm
            already lists <code>docker compose up</code>{" "}
            <Link href={CONFIG_PATH} className={LINK}>
              as one of its services
            </Link>
            , beside any native ones it found.
          </>
        ),
      },
    ],
  },
  {
    prompt: "You use pm2 for local dev",
    cards: [
      {
        slug: "pm2",
        name: "PM2",
        what: "A production process supervisor: keep-alive with backoff, cluster mode across cores, boot persistence, log rotation.",
        switchIf:
          "you are driving a production daemon through a dev loop you sit and watch.",
        stayIf: (
          <>
            you need cluster mode, <code>pm2 startup</code>, or zero-downtime
            reload. Different jobs — plenty of people run both.
          </>
        ),
      },
    ],
  },
  {
    prompt: "You are choosing a terminal for coding agents",
    cards: [
      {
        slug: "cmux",
        name: "cmux",
        what: "A macOS terminal built around agent sessions: workspaces you switch between, plus a browser pane and a CLI you can automate.",
        switchIf:
          "you want the project managed too — services, a port check before they start, and a separate checkout per agent — not just the panes.",
        stayIf: "the terminal is the whole job.",
        extra: (
          <>
            Either way, read the{" "}
            <Link href={AI_AGENTS_PATH} className={LINK}>
              agent-workflow guide →
            </Link>
          </>
        ),
      },
    ],
  },
];

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <dt className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400 [&_code]:font-mono [&_code]:text-xs">
        {children}
      </dd>
    </div>
  );
}

export default function Router() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader title="Start here: what are you using now?" />

        <div className="space-y-10">
          {GROUPS.map((group) => (
            <div key={group.prompt}>
              <p className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-gray-400">
                {group.prompt}
              </p>
              <div
                className={`mt-4 grid gap-4 ${
                  group.cards.length > 1 ? "md:grid-cols-2" : ""
                }`}
              >
                {group.cards.map((card) => (
                  <article
                    key={card.slug}
                    className="rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors duration-200 p-6"
                  >
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      <Link
                        href={vsPath(card.slug)}
                        className="group -my-2.5 inline-flex items-center gap-1.5 py-2.5"
                      >
                        lpm vs {card.name}
                        <ArrowRight
                          className="w-3.5 h-3.5 shrink-0 text-gray-300 dark:text-gray-600 group-hover:text-gray-900 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all duration-200"
                          aria-hidden
                        />
                      </Link>
                    </h3>
                    <dl>
                      <Line label="What it is">{card.what}</Line>
                      <Line label="Switch if">{card.switchIf}</Line>
                      <Line label="Stay if">{card.stayIf}</Line>
                    </dl>
                    {card.extra && (
                      <p className="mt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                        {card.extra}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
