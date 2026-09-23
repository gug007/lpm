export const FEATURE_FAQS = [
  {
    question: "Are any features paid or behind an account?",
    answer:
      "None. Every feature on this page ships in the free, MIT-licensed app, and nothing asks you to sign up; the lpm link iPhone app costs nothing on the App Store either.",
  },
  {
    question: "Which features need Claude Code or Codex?",
    answer:
      "Live status, alerts, session resume, fork, copy last answer, slash-command autocomplete, and model switching work only with Claude Code and Codex, and pinning an account per project is Claude Code only. The launchers also cover Gemini CLI and OpenCode, and any other CLI runs in a terminal or behind a button. You install and sign in to each agent yourself.",
  },
  {
    question: "Do duplicates or worktrees get their own ports?",
    answer:
      "No. lpm doesn't isolate ports or containers. A duplicate is a full folder copy, including .env files and node_modules, and a worktree shares the repo's Git history. Each copy runs the same commands, so give copies their own ports, for example with a PORT variable in their config. lpm checks for a busy port before starting a project and can stop whatever holds it.",
  },
  {
    question: "Do my dev servers and automations keep running when lpm is closed?",
    answer:
      "Dev servers do: they keep running after you quit or update lpm, and the app picks them up again when you reopen it. In-app terminals, including agent tabs, end when you quit. Automations need lpm open on an awake Mac; a run that came due while it wasn't fires once when lpm is back. For work that keeps going after your Mac closes, add a Linux host.",
  },
  {
    question: "Which features talk to the network?",
    answer:
      "A few, and none of them send your code to lpm. Update checks go to GitHub, AI commit messages go through the agent CLI you installed under your own account, links to your other Macs, servers, and iPhone are direct, and iPhone push alerts cross one relay encrypted so only your phone can read them. The Mac app, CLI, and iPhone app have no analytics or telemetry built in.",
  },
  {
    question: "Can I use lpm from my iPhone or another computer?",
    answer:
      "Yes. The lpm link app mirrors terminals and controls projects from an iPhone or iPad, Connect Macs lets one Mac drive another, and a Linux host or SSH project runs work on a server. Every command runs on the machine that owns the project, so it has to be on and reachable, for example over your home network or Tailscale.",
  },
];
