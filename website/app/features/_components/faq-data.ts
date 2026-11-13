import { OTHER_STATUS_AGENT_NAMES } from "@/lib/app-facts";

export const FEATURE_FAQS = [
  {
    question: "Are any features paid or behind an account?",
    answer:
      "None. Every feature on this page ships in the free, MIT-licensed app, and nothing asks you to sign up; the lpm link iPhone app costs nothing on the App Store either.",
  },
  {
    question: "Which features need Claude Code or Codex?",
    answer:
      `Session resume, fork, copy last answer, slash-command autocomplete, and model switching work only with Claude Code and Codex, and pinning an account per project is Claude Code only. Live status and alerts extend to ${OTHER_STATUS_AGENT_NAMES}, though Cursor CLI never shows Needs you. The launchers also cover Gemini CLI and OpenCode, and any other CLI runs in a terminal or behind a button. You install and sign in to each agent yourself.`,
  },
  {
    question: "Do duplicates or worktrees get their own ports?",
    answer:
      "No. lpm doesn't isolate ports or containers. A duplicate is a full folder copy, including .env files and node_modules, and a worktree shares the repo's Git history. Each copy runs the same commands, so give copies their own ports, for example with a PORT variable in their config. lpm checks for a busy port before starting a project and can stop whatever holds it.",
  },
  {
    question: "Do my dev servers and automations keep running when lpm is closed?",
    answer:
      "Dev servers do: they keep running after you quit or update lpm, and the app picks them up again when you reopen it. In-app terminals, including agent tabs, end when you quit. Automations need lpm open on an awake computer; a run that came due while it wasn't fires once when lpm is back. For Claude Code and Codex runs that keep going after your laptop closes, pair an always-on Mac such as a Mac mini, or add a Linux host.",
  },
  {
    question: "Which features talk to the network?",
    answer:
      "A few, and none of them let lpm read your code. Update checks go to GitHub, AI commit messages go through the agent CLI you installed under your own account, and links to your other computers, servers, and iPhone are direct. Two things cross a relay: iPhone push alerts, sealed so the relay can't read them, and a tab you share with someone's browser, encrypted end to end between their browser and your computer. The desktop app, CLI, and iPhone app have no analytics built in, and the desktop app's crash reports can be turned off in Settings.",
  },
  {
    question: "Can I use lpm from my iPhone or another computer?",
    answer:
      "Yes. The lpm link app mirrors terminals and controls projects from an iPhone or iPad, Connect computers lets one computer running lpm drive another, such as a Mac mini that stays on, and a Linux host or SSH project runs work on a server. Every command runs on the machine that owns the project, so it has to be on and reachable, for example over your home network or Tailscale.",
  },
];
