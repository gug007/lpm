export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "How do I run multiple Claude Code sessions at once?",
    answer:
      "In lpm, press ⌘T for another terminal tab or ⌘D to split the pane, and start Claude Code in each; those sessions share the project folder. When the sessions might edit the same files, give each its own folder instead: right-click the project and choose Duplicate for full copies, or New Worktree for Git worktrees on their own branches.",
  },
  {
    question: "Can two Claude Code agents work in the same folder?",
    answer:
      "Yes, as long as they touch different files. Both agents read and write the same working tree, so two edits to one file overwrite each other, and both share one branch and one running dev server. For overlapping tasks, give each agent a copy or a worktree.",
  },
  {
    question: "Should I use a copy or a Git worktree for each agent?",
    answer:
      "Use a copy (Duplicate) when the agent needs your current state: uncommitted work, .env files and installed dependencies come along, and each copy gets its own Git repository. Use a worktree when each task should end as its own branch: it starts clean from the current commit on a new lpm/<name> branch and shares your repository's history.",
  },
  {
    question: "How do I send the same prompt to several agents?",
    answer:
      "Write the prompt in the input under the terminal, open the menu beside Send and choose Run in duplicates. Pick how many runs you want; the prompt runs in the current terminal and in fresh copies of the project, and nothing starts until you confirm. From a script, lpm duplicate -n 3 --command claude --prompt followed by your prompt starts the same prompt in three new copies.",
  },
  {
    question: "How do I know which agent needs me?",
    answer:
      "Claude Code and Codex tabs show Working, Needs you, Done or Problem, and so do the rows under each project in the sidebar, with how long each state has lasted. Press ⌘⇧A for Activity, every Claude Code and Codex session across your projects, waiting ones first. lpm also plays a sound, shows a macOS banner when it isn't in front, and can push to your iPhone through the lpm link app.",
  },
  {
    question: "Does running agents in parallel use more of my plan?",
    answer:
      "Yes. Each session runs on your own Claude Code or Codex sign-in and spends from the same limits; lpm hosts no model. The Usage window shows your 5-hour and weekly windows for Codex, and for Claude once you switch it on, and a sidebar meter keeps one of them in view with a marker for how far into the window you are. For Claude Code you can also pin a different account to each project.",
  },
  {
    question: "Do parallel copies get their own ports and databases?",
    answer:
      "No. lpm separates files, not runtime resources: copies and worktrees share your Mac's ports, local databases and Docker. If a service's declared port is already taken when you start a project, lpm shows what holds the port and, unless you chose otherwise for that service, asks before stopping it.",
  },
  {
    question: "Does it work with Codex, Gemini CLI or OpenCode?",
    answer:
      "Codex gets the same live status, alerts, resume and fork support as Claude Code. Gemini CLI and OpenCode run in tabs, copies and worktrees like any terminal command, but without live status or alerts.",
  },
];
