import Link from "next/link";
import {
  Bot,
  FolderKanban,
  GitPullRequest,
  LayoutGrid,
  ScanSearch,
  Server,
  SquareTerminal,
  Terminal,
} from "lucide-react";
import type { OsFeature } from "@/components/os-terminal/os-features";
import type { OsNote } from "@/components/os-terminal/os-notes";
import type { FaqItem } from "@/components/vs/faq";
import { LINUX_HOST_PATH } from "@/lib/links";

const LINK =
  "font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white";

export const FEATURES: OsFeature[] = [
  {
    icon: ScanSearch,
    title: "Services detected from your repo",
    body: "Add a folder and lpm reads its package.json, Procfile, Compose file, or Rails, Django, Go and Cargo setup, then fills in each dev server it finds. In a monorepo, every app becomes its own service.",
  },
  {
    icon: LayoutGrid,
    title: "A log tab for every service",
    body: "Each service streams in its own tab, labeled with the ports it listens on. lpm checks ports when you press Start, names whatever holds a busy one, and offers to stop it.",
  },
  {
    icon: FolderKanban,
    title: "Switch projects without stopping them",
    body: "Each project keeps its own services, logs and terminals. Jump to another repo in the sidebar; the first one keeps running, logs intact.",
  },
  {
    icon: SquareTerminal,
    title: "Your shell and dotfiles, as they are",
    body: "Tabs start your login shell in the project folder, so your shell config, aliases, version managers and direnv load the way they do in any terminal, with tabs, split panes and search around them.",
  },
  {
    icon: Bot,
    title: "Claude Code and Codex beside your services",
    body: "One click opens Claude Code, Codex, Gemini CLI or OpenCode in the project. The sidebar shows which agent is working, done or waiting for you, with a chime and a desktop notification when one needs you.",
  },
  {
    icon: GitPullRequest,
    title: "Review, commit and open the pull request",
    body: "Read every change in one diff, edit in the Files tab, let AI write the commit message, then push and open the pull request without leaving the window.",
  },
  {
    icon: Terminal,
    title: "The lpm command for scripts and agents",
    body: "The .deb and .rpm add the lpm command, so a script or a coding agent can start a project, read a service's logs, or wait for a port to be ready.",
  },
  {
    icon: Server,
    title: "Also a host on a server",
    body: (
      <>
        On a server without a screen, the same lpm runs as a host: add it by
        typing user@server, and its services and agents keep running after
        your laptop closes. See{" "}
        <Link href={LINUX_HOST_PATH} className={LINK}>
          Claude Code on a remote server
        </Link>
        .
      </>
    ),
  },
];

export const NOTES: OsNote[] = [
  {
    title: "64-bit x86 with glibc 2.35 or newer",
    body: "Ubuntu 22.04 and up, or any other distribution with glibc 2.35 or newer. There's no ARM build yet.",
  },
  {
    title: "Pick a package",
    body: "The .deb and .rpm bring Git, SSH and a clipboard tool along and add the lpm command. With the AppImage, install Git, SSH and wl-clipboard or xclip yourself.",
  },
  {
    title: "Sounds and banners use your desktop",
    body: "The chime needs a sound player, and banners need your desktop's notification service.",
  },
  {
    title: "Web previews open in your browser",
    body: "On Linux, a dev server's address opens in your default browser instead of a tab inside lpm.",
  },
  {
    title: "Copies are usually full copies",
    body: "On a Mac a duplicate shares disk space with the original; on Linux it's usually a full copy of the folder.",
  },
  {
    title: "Updates arrive as a download",
    body: "When a new version is out, lpm tells you and opens its download; install the new package, or swap in the new AppImage.",
  },
  {
    title: "A beta that isn't code-signed yet",
    body: "Each release lists SHA-256 checksums; compare yours with sha256sum before installing.",
  },
  {
    title: "What isn't on Linux",
    body: "Voice dictation in the prompt box relies on a Mac app, so it's Mac-only.",
  },
];

export const FAQS: FaqItem[] = [
  {
    question: "Which Linux distributions does lpm support?",
    answer:
      "Any 64-bit x86 distribution with glibc 2.35 or newer, such as Ubuntu 22.04 and up. Use the .deb on Debian and Ubuntu, the .rpm on Fedora and other rpm systems, and the AppImage anywhere else.",
  },
  {
    question: "Is there an ARM build for Linux?",
    answer:
      "Not yet. The Linux packages are for 64-bit x86 (amd64) computers only.",
  },
  {
    question: "Can I run lpm on a server without a screen?",
    answer:
      "Yes. Add the server in lpm by typing user@server: lpm installs itself there over SSH and pairs, and the server's services and agents keep running after you close your laptop.",
  },
  {
    question: "Do my dotfiles and version managers still work?",
    answer:
      "Yes. Each tab starts your login shell in the project folder, so your shell config, aliases, version managers such as nvm, pyenv or mise, and direnv load as usual.",
  },
  {
    question: "How do I update lpm on Linux?",
    answer:
      "lpm checks for a new version when it opens and every 24 hours. On Linux it tells you and opens the download in your browser; install the new package over the old one, or replace the AppImage.",
  },
  {
    question: "Is lpm free on Linux?",
    answer:
      "Yes. lpm is free and MIT-licensed on every system, with no account and no paid tier.",
  },
];
