import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  CONNECT_AGENTS_PATH,
  LINUX_HOST_PATH,
  MAC_MINI_PATH,
  MOBILE_PATH,
  SSH_TERMINAL_MAC_PATH,
  WORKTREE_AGENTS_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdString,
  webPageJsonLd,
  youtubeLessonJsonLd,
} from "@/lib/structured-data";
import AddHostDemo from "./_components/add-host-demo";
import AfterConnect from "./_components/after-connect";
import Alternatives from "./_components/alternatives";
import Cta from "./_components/cta";
import Faq, { FAQ_ITEMS } from "./_components/faq";
import Hero from "./_components/hero";
import HowItWorks from "./_components/how-it-works";
import InstallOnLinux from "./_components/install-on-linux";
import Lesson from "./_components/lesson";
import Lifetimes from "./_components/lifetimes";
import Problem from "./_components/problem";
import QuickAnswer from "./_components/quick-answer";
import Requirements from "./_components/requirements";
import Security from "./_components/security";

const TITLE = "Claude Code & Codex on a Linux Server That Keeps Running";
const DESCRIPTION =
  "Run Claude Code and Codex on a Linux box you own: add it by typing user@host, lpm pairs itself over SSH, and the server keeps working with your lid closed.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "run claude code on a remote server",
    "claude code remote server",
    "claude code on linux server",
    "claude code stops when ssh disconnects",
    "run claude code 24/7",
    "keep claude code running when laptop sleeps",
    "claude code on a vps",
    "claude code headless linux server",
    "run codex cli on a remote server",
    "run claude code on linux server from mac",
    "remote dev server for ai coding agents",
    "run ai coding agents on a server",
    "self hosted claude code server",
    "control claude code running on a server from my mac",
    "run multiple claude code agents on one server",
    "install claude code on ubuntu server",
    "install claude code on linux",
    "claude code linux",
    "claude codex linux",
    "install claude code on remote server",
  ],
  alternates: {
    canonical: LINUX_HOST_PATH,
  },
  openGraph: {
    title: TITLE,
    description:
      "One field — user@host — and lpm installs itself on your Linux server over SSH. Its projects, terminals, services and AI agents appear in your sidebar and keep running when you close the lid.",
    type: "website",
    url: LINUX_HOST_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Move long Claude Code and Codex runs onto a Linux box you own, and drive it from the desktop app you already use.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: LINUX_HOST_PATH,
    about: [
      "running Claude Code on a remote Linux server",
      "running Codex on a remote server",
      "keeping AI coding agents running when a laptop sleeps",
      "remote development environments for AI agents",
      "SSH-connected Linux hosts",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Run Claude Code on a remote server", path: LINUX_HOST_PATH },
  ]),
  faqJsonLd(FAQ_ITEMS),
  youtubeLessonJsonLd("claude-code-codex-remote-server"),
];

export default function RunOnRemoteServerPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <AddHostDemo />
      <QuickAnswer />
      <InstallOnLinux />
      <Problem />
      <HowItWorks />
      <Lesson />
      <AfterConnect />
      <Lifetimes />
      <Security />
      <Requirements />
      <Alternatives />
      <Faq />
      <RelatedPages
        links={[
          {
            href: SSH_TERMINAL_MAC_PATH,
            title: "SSH terminal for Mac",
            description:
              "The other half of remote work: reaching a box from your Mac terminal, with its ports forwarded to localhost.",
          },
          {
            href: CONNECT_AGENTS_PATH,
            title: "Connect AI agents to your dev environment",
            description:
              "The command-line tool agents use to run services and check logs, on the server as well.",
          },
          {
            href: WORKTREE_AGENTS_PATH,
            title: "Git worktrees for AI agents",
            description:
              "How to give several parallel agents their own directory once you have a machine with cores to spare.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "The desktop side: agents, services, and logs side by side in one project window.",
          },
          {
            href: MOBILE_PATH,
            title: "Your agents on your iPhone",
            description:
              "Pair the phone with your Mac or with the server itself, then watch a run and answer a prompt from anywhere.",
          },
          {
            href: MAC_MINI_PATH,
            title: "Run Claude Code & Codex on a Mac mini",
            description:
              "No server to rent: start Claude Code and Codex on a Mac that stays on, from your laptop.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
