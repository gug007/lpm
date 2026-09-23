import Link from "next/link";
import type { FaqItem } from "@/components/vs/faq";
import { LINUX_HOST_PATH, vsPath } from "@/lib/links";

const OVERMIND_PATH = vsPath("overmind");

const OVERMIND_FIRST_ANSWER =
  "Overmind, if you want to attach to or restart one process without touching the rest — it runs each process in its own tmux window to make that possible, and -m web=2,worker=3 scales one of them. Foreman, if one interleaved stream on stdout is all you need, if you would rather not install tmux, or if your deploy depends on foreman export.";

export const FOREMAN_FAQ: FaqItem[] = [
  {
    question: "Foreman or Overmind — which should I use?",
    answer: (
      <>
        <Link
          href={OVERMIND_PATH}
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          Overmind
        </Link>
        , if you want to attach to or restart one process without touching the
        rest — it runs each process in its own tmux window to make that possible,
        and <code className="whitespace-nowrap">-m web=2,worker=3</code>{" "}
        scales one of them. Foreman, if one
        interleaved stream on stdout is all you need, if you would rather not
        install tmux, or if your deploy depends on <code>foreman export</code>.
      </>
    ),
    answerText: OVERMIND_FIRST_ANSWER,
  },
  {
    question: "Does lpm read my Procfile?",
    answer: (
      <>
        Once. When you add the folder, lpm opens <code>Procfile.dev</code>{" "}
        (or <code>Procfile</code>, if that is all there is) and makes each line
        a service, keeping its name, its command and any <code className="whitespace-nowrap">-p</code>{" "}
        port. After that the list is lpm&apos;s own, so a line you add to the
        Procfile later has to be added in lpm too. The file itself is never
        touched — it stays in the repo for Heroku and{" "}
        <code>foreman export</code>.
      </>
    ),
    answerText:
      "Once. When you add the folder, lpm opens Procfile.dev (or Procfile, if that is all there is) and makes each line a service, keeping its name, its command and any -p port. After that the list is lpm's own, so a line you add to the Procfile later has to be added in lpm too. The file itself is never touched — it stays in the repo for Heroku and foreman export.",
  },
  {
    question: "What replaces bin/dev in a Rails app?",
    answer: (
      <>
        <code>bin/dev</code> shells out to Foreman with{" "}
        <code>Procfile.dev</code>. With lpm you press Start, or run{" "}
        <code>lpm start</code>, and the same lines come up as separate panes.
        Keep <code>bin/dev</code> working — nothing removes it.
      </>
    ),
    answerText:
      "bin/dev shells out to Foreman with Procfile.dev. With lpm you press Start, or run lpm start, and the same lines come up as separate panes. Keep bin/dev working — nothing removes it.",
  },
  {
    question: "Does lpm load .env the way foreman start does?",
    answer: (
      <>
        No. lpm exports the <code>env:</code> map you write on each service, so
        move the variables you need there or keep loading <code>.env</code>{" "}
        inside the command with dotenv.
      </>
    ),
    answerText:
      "No. lpm exports the env: map you write on each service, so move the variables you need there or keep loading .env inside the command with dotenv.",
  },
  {
    question: "Does lpm replace foreman export?",
    answer:
      "No. If you use foreman export to generate upstart, systemd, or launchd unit files for deploy, keep using Foreman for that. lpm is focused on the local dev loop — starting the stack on your machine, viewing live output per service, and switching between projects — not on producing init-system artifacts for servers.",
  },
  {
    question: "Does it run on Linux or Windows?",
    answer: (
      <>
        Foreman is a Ruby gem that runs on Linux as well as macOS, and Overmind
        covers Linux, *BSD and macOS; neither documents a Windows setup. lpm is
        the odd one out — its window opens on a Mac and nowhere else. A Linux
        server can still be{" "}
        <Link
          href={LINUX_HOST_PATH}
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          where your Rails processes actually run
        </Link>
        , with the Mac driving them.
      </>
    ),
    answerText:
      "Foreman is a Ruby gem that runs on Linux as well as macOS, and Overmind covers Linux, *BSD and macOS; neither documents a Windows setup. lpm is the odd one out — its window opens on a Mac and nowhere else. A Linux server can still be where your Rails processes actually run, with the Mac driving them.",
  },
];
