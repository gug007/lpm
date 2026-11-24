export const FAQS = [
  {
    question: "How do I schedule Claude Code tasks?",
    answer:
      "Open Automations in lpm and create a job. Write the prompt, pick Claude Code and a model, and choose when it runs: every day, on certain days, on an interval, when something happens, or only when you start it. Each run happens in the background with no terminal tab to keep open, and the answer lands in the job's history, ready to read and reply to. lpm is free and open source.",
  },
  {
    question: "Is this a cron job for Claude Code? Do I need crontab?",
    answer:
      "No crontab and no cron syntax. lpm has its own scheduler inside the app, and you set the schedule in a form rather than a cron expression. A job set for a fixed time starts within a few minutes of it, so jobs set for the same hour don't all begin at once. Intervals can be as short as 5 minutes.",
  },
  {
    question: "Will a job run overnight or while my computer is asleep?",
    answer:
      "Jobs run while lpm is open and your computer is awake, so an overnight job needs both. If a run was due while the computer slept or lpm was closed, it runs once when they're back; missed runs aren't replayed one by one. If a job is still running when it's due again, the new run is skipped. To run jobs overnight without leaving your laptop on, add them to a project on an always-on Mac you've paired, such as a Mac mini: they run there.",
  },
  {
    question: "Will a scheduled agent change the folder I'm working in?",
    answer:
      "Only if you let it. Set Works on to the project itself, a fresh copy of it, or a new Git worktree. A fresh copy is a full copy of the project folder, including files like .env and installed dependencies; a worktree is a linked Git checkout without them. Each copy shows up as its own project, so you can open it, review the changes and remove it, and the next run waits until you have.",
  },
  {
    question: "What's the difference between Full access and Read only?",
    answer:
      "Full access starts the agent without approval prompts: Claude Code with --dangerously-skip-permissions, Codex with --dangerously-bypass-approvals-and-sandbox, Gemini CLI with --yolo. The agent can then edit files and run commands unattended. It's the default for AI prompt jobs. Read only leaves those flags off, for jobs that should look and report. OpenCode always runs with full access.",
  },
  {
    question: "Which agents and models can I schedule?",
    answer:
      "Claude Code, Codex, Gemini CLI and OpenCode, or whichever agent lpm uses by default. For Claude Code and Codex you can also pick the model and a reasoning effort level. A job can run a shell command or one of the project's saved actions instead of a prompt. Run cost is shown for Claude Code runs.",
  },
  {
    question: "Can I get notified on my iPhone when a job finishes?",
    answer:
      "Yes, with the free lpm link app. A paired iPhone can get a push notification when a job starts, finishes, or fails or times out, and you choose which ones. Pushes arrive while the app isn't open on the phone, and jobs with no project aren't pushed. On your computer, lpm raises a system notification for the same moments whenever it isn't the app in front.",
  },
  {
    question: "Can a script or another agent trigger an automation?",
    answer:
      "Yes. The lpm CLI can list, create, edit, run and stop automations, pause or resume one, print its history or live output, and reply to an AI job's conversation, with --json for output scripts can parse. The desktop app must be running.",
  },
  {
    question: "Can an automation start when CI fails or a service crashes?",
    answer:
      "Yes. Set its When to Event and pick CI fails, A service crashes or An agent finishes. CI follows the commits you push from this computer, with the GitHub CLI signed in. A crash is noticed within a minute. When an agent finishes, the job can run a prompt or a command, not an action. Each job reacts once per commit, or once a day, and a CI job stops after three runs in a row on a branch until CI passes there. Like every automation, it runs while lpm is open and your computer is awake, on local projects.",
  },
];
