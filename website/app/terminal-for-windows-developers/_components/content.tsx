import Link from "next/link";
import {
  Bot,
  Copy,
  FolderKanban,
  GitPullRequest,
  Globe,
  LayoutGrid,
  ScanSearch,
  SquareTerminal,
} from "lucide-react";
import type { OsFeature } from "@/components/os-terminal/os-features";
import type { OsNote } from "@/components/os-terminal/os-notes";
import type { FaqItem } from "@/components/vs/faq";
import { PARALLEL_PATH } from "@/lib/links";
import { pcShortcut } from "@/lib/shortcuts";

const LINK =
  "font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white";

export const FEATURES: OsFeature[] = [
  {
    icon: FolderKanban,
    title: "A workspace per project, not a pile of tabs",
    body: "Each project keeps its own services, logs and terminals. Switch repos in the sidebar, and whatever you left running keeps running.",
  },
  {
    icon: ScanSearch,
    title: "Services detected from your repo",
    body: "Add a folder and lpm reads its package.json, Procfile, Compose file, or Rails, Django, Go and Cargo setup, then fills in each dev server it finds. In a monorepo, every app becomes its own service.",
  },
  {
    icon: LayoutGrid,
    title: "A log tab for every service",
    body: "Each service streams in its own tab, labeled with the ports it listens on, so you can see which one threw. lpm checks ports when you press Start and offers to free a busy one.",
  },
  {
    icon: SquareTerminal,
    title: "Git Bash, already in the right folder",
    body: "New tabs open in the project folder with Git Bash as your login shell, so the bash commands in your README work as written, with tabs, split panes and search around them.",
  },
  {
    icon: Bot,
    title: "Claude Code and Codex beside your services",
    body: "One click opens Claude Code, Codex, Gemini CLI or OpenCode in the project. The sidebar shows which agent is working, done or waiting for you, with a chime and a Windows notification when one needs you.",
  },
  {
    icon: Copy,
    title: "A copy of the project for each agent",
    body: (
      <>
        Duplicate or New worktree gives each agent its own folder, terminals
        and services, so no two agents edit the same files. See how to{" "}
        <Link href={PARALLEL_PATH} className={LINK}>
          run Claude Code in parallel
        </Link>
        .
      </>
    ),
  },
  {
    icon: Globe,
    title: "Preview the app in a tab",
    body: "Open your dev server in a browser tab inside lpm, right next to the service that serves it, and watch the page and its logs at once.",
  },
  {
    icon: GitPullRequest,
    title: "Review, commit and open the pull request",
    body: `Read every change in one diff, jump to a file with ${pcShortcut("⌘P")} and save with ${pcShortcut("⌘S")}, let AI write the commit message, then push and open the pull request from the same window.`,
  },
];

export const NOTES: OsNote[] = [
  {
    title: "Git for Windows comes first",
    body: "Terminals, services and agents run in its Git Bash. Install it before lpm, or commands fail to start.",
  },
  {
    title: "A beta that isn't code-signed yet",
    body: "SmartScreen may warn the first time: choose More info, then Run anyway. Each release lists SHA-256 checksums to compare with Get-FileHash.",
  },
  {
    title: "Installs for your user",
    body: "The installer needs no admin rights. When a new version is out, lpm tells you and opens its download; run the installer to update.",
  },
  {
    title: "Dev servers outlive the window",
    body: `${pcShortcut("⌘Q")} quits lpm. Dev servers keep running after you quit, and lpm picks them up when you open it again; terminal and agent tabs end.`,
  },
  {
    title: "Copies are full copies",
    body: "On a Mac a duplicate shares disk space with the original; on Windows it's a full copy of the folder.",
  },
  {
    title: "SSH is slower to open",
    body: "On an SSH project each terminal opens its own connection on Windows, where macOS and Linux share one per host.",
  },
  {
    title: "Your phone and your other computers",
    body: "lpm Link on iPhone pairs with a Windows PC as it does with a Mac. Allow control asks for a firewall permission the first time.",
  },
  {
    title: "What isn't on Windows",
    body: "Voice dictation in the prompt box relies on a Mac app, and there's no ARM64 build.",
  },
];

export const FAQS: FaqItem[] = [
  {
    question: "Does lpm need WSL?",
    answer:
      "No. lpm runs on Windows itself and sends every terminal, service and agent through Git Bash, the bash that comes with Git for Windows.",
  },
  {
    question: "Why does lpm need Git for Windows?",
    answer:
      "lpm runs its commands in Git Bash, so the bash commands and scripts your project already has work the way they do on macOS and Linux. Git for Windows also brings the git that review, commits and pull requests use.",
  },
  {
    question: "Why does SmartScreen warn about the installer?",
    answer:
      "The Windows build is a beta and isn't code-signed yet, so SmartScreen doesn't recognize it. Choose More info, then Run anyway. To check the file first, compare its Get-FileHash output with the SHA-256 checksum listed on the release.",
  },
  {
    question: "Can I run Claude Code and Codex on Windows with lpm?",
    answer:
      "Yes. Install them and sign in as usual. lpm's buttons open them in the project folder and show whether each one is working, done or waiting for you, with a sound and a notification when one needs you.",
  },
  {
    question: "Can I drive lpm on my Windows PC from another computer or my iPhone?",
    answer:
      "Yes. Turn on Allow control under + above your projects → Another computer, and a paired computer can run the PC's projects; Windows asks for a firewall permission the first time. lpm Link on iPhone pairs with the PC too.",
  },
  {
    question: "Is lpm free on Windows?",
    answer:
      "Yes. lpm is free and MIT-licensed on every system, with no account and no paid tier.",
  },
];
