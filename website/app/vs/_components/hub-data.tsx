import Link from "next/link";
import type { FaqItem } from "@/components/vs/faq";
import { vsPath } from "@/lib/links";

const LINK =
  "underline underline-offset-2 hover:text-gray-900 dark:hover:text-white";
const CODE = "font-mono text-xs";

export const HUB_SOURCES = [
  { href: "https://iterm2.com/documentation.html", label: "iTerm2's documentation" },
  { href: "https://iterm2.com/news.html", label: "iTerm2's 3.7 release notes" },
  {
    href: "https://iterm2.com/claude-code-integration.html",
    label: "iTerm2's Claude Code docs",
  },
  { href: "https://man.openbsd.org/tmux.1", label: "the tmux manual" },
  { href: "https://github.com/manaflow-ai/cmux", label: "the cmux README" },
  { href: "https://docs.docker.com/compose/", label: "the Docker Compose docs" },
  {
    href: "https://docs.docker.com/reference/compose-file/services/",
    label: "the Compose file reference",
  },
  {
    href: "https://docs.docker.com/subscription/desktop-license/",
    label: "Docker Desktop's licence terms",
  },
  { href: "https://ddollar.github.io/foreman/", label: "the Foreman man page" },
  {
    href: "https://github.com/DarthSim/overmind#readme",
    label: "Overmind's README",
  },
  {
    href: "https://pm2.keymetrics.io/docs/usage/process-management/",
    label: "PM2's process-management docs",
  },
  {
    href: "https://pm2.keymetrics.io/docs/usage/restart-strategies/",
    label: "its restart strategies",
  },
  {
    href: "https://pm2.keymetrics.io/docs/usage/cluster-mode/",
    label: "cluster mode",
  },
  {
    href: "https://pm2.keymetrics.io/docs/usage/startup/",
    label: "startup scripts",
  },
  {
    href: "https://pm2.keymetrics.io/docs/usage/log-management/",
    label: "log management pages",
  },
];

export const HUB_FAQ: FaqItem[] = [
  {
    question:
      "What is the difference between a multiplexer, a Procfile runner, and a container stack?",
    answer:
      "A multiplexer (tmux) gives you panes and keeps them alive; you decide what runs in them. A Procfile runner (Foreman, Overmind) starts a fixed list of named processes with one command. A container stack (Docker Compose) also builds the environment those processes run in. Three different layers, and it is normal to want two of them.",
  },
  {
    question: "Does lpm read a Procfile or a compose file?",
    answer: (
      <>
        Once, at the moment you add the folder.{" "}
        <code className={CODE}>Procfile.dev</code>{" "}— or{" "}
        <code className={CODE}>Procfile</code>{" "}when there is no{" "}
        <code className={CODE}>.dev</code>{" "}one — turns into one service per
        line under the same names and commands, minus the{" "}
        <code className={CODE}>release</code>{" "}line, and a compose file turns
        into a single <code className={CODE}>docker compose up</code>{" "}
        service beside the native ones. From then on the list belongs to lpm: a
        later edit to the Procfile is not picked up, whereas Foreman, Overmind
        and Compose go back to their file on every start.
      </>
    ),
    answerText:
      "Once, at the moment you add the folder. Procfile.dev — or Procfile when there is no .dev one — turns into one service per line under the same names and commands, minus the release line, and a compose file turns into a single docker compose up service beside the native ones. From then on the list belongs to lpm: a later edit to the Procfile is not picked up, whereas Foreman, Overmind and Compose go back to their file on every start.",
  },
  {
    question: "Where do Foreman and Overmind fit next to the other five?",
    answer: (
      <>
        Both are Procfile runners you drive from a terminal. Foreman prints
        every process into one merged stream; Overmind gives each its own tmux
        window, so tmux has to be installed first. The head-to-head, with the
        Procfile conversion, is on the{" "}
        <Link href={vsPath("foreman")} className={LINK}>
          Foreman vs Overmind page
        </Link>
        .
      </>
    ),
    answerText:
      "Both are Procfile runners you drive from a terminal. Foreman prints every process into one merged stream; Overmind gives each its own tmux window, so tmux has to be installed first. The head-to-head, with the Procfile conversion, is on the Foreman vs Overmind page.",
  },
  {
    question: "Which of these run on Linux or Windows?",
    answer:
      "tmux, Docker Compose, Foreman and PM2 all run on Linux, and Compose and PM2 run on Windows too; Overmind covers Linux, *BSD and macOS. iTerm2, cmux and lpm are Mac apps. lpm can drive a Linux machine as a headless host from the Mac, but the app itself is macOS only.",
  },
  {
    question: "Which of them will launch Claude Code or Codex for me?",
    answer: (
      <>
        cmux and lpm, and as of September 2026{" "}
        <a
          href="https://iterm2.com/news.html"
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          iTerm2 has a Claude Code integration
        </a>{" "}
        too. cmux is built around agent sessions in the terminal. lpm puts
        Claude Code and Codex a click away in every project from the first
        launch, offers Gemini CLI
        and OpenCode when they are installed, opens each agent in its own tab
        alongside the running services, marks a Claude Code or Codex tab
        working, needs-you or done as the agent goes, and can copy the whole
        project so two agents never edit the same files. The rest are process
        runners with no opinion about agents.
      </>
    ),
    answerText:
      "cmux and lpm, and as of September 2026 iTerm2 has a Claude Code integration too. cmux is built around agent sessions in the terminal. lpm puts Claude Code and Codex a click away in every project from the first launch, offers Gemini CLI and OpenCode when they are installed, opens each agent in its own tab alongside the running services, marks a Claude Code or Codex tab working, needs-you or done as the agent goes, and can copy the whole project so two agents never edit the same files. The rest are process runners with no opinion about agents.",
  },
  {
    question: "Can I run more than one of these at once?",
    answer:
      "Usually yes, and most people do. Keep iTerm2 or tmux for SSH and ad-hoc shells, keep PM2 for anything that has to stay alive, keep compose for the services that need a container — and let one tool own starting and stopping the project. Nothing here holds your processes hostage.",
  },
  {
    question: "Which of them are free and open source?",
    answer: (
      <>
        tmux, Foreman, Overmind, PM2 and Docker Compose are all open source and
        free; iTerm2 is free under GPLv2 and lpm is free under MIT. cmux ships
        under GPL-3.0-or-later; an organisation that cannot live with that can
        ask for commercial terms, and new features reach paying Founder&apos;s
        Edition users first. Docker Desktop — how most Mac developers get Compose — is
        the one that can cost money: past{" "}
        <a
          href="https://docs.docker.com/subscription/desktop-license/"
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          Docker&apos;s size and revenue thresholds
        </a>{" "}
        a company needs a paid subscription.
      </>
    ),
    answerText:
      "tmux, Foreman, Overmind, PM2 and Docker Compose are all open source and free; iTerm2 is free under GPLv2 and lpm is free under MIT. cmux ships under GPL-3.0-or-later; an organisation that cannot live with that can ask for commercial terms, and new features reach paying Founder's Edition users first. Docker Desktop — how most Mac developers get Compose — is the one that can cost money: past Docker's size and revenue thresholds a company needs a paid subscription.",
  },
];
