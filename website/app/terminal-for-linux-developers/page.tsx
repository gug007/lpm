import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { OsCta } from "@/components/os-terminal/os-cta";
import { OsFeatures } from "@/components/os-terminal/os-features";
import { OsHero } from "@/components/os-terminal/os-hero";
import { OsInstall } from "@/components/os-terminal/os-install";
import { OsNotes } from "@/components/os-terminal/os-notes";
import { RelatedPages } from "@/components/related-pages";
import { Faq } from "@/components/vs/faq";
import {
  AI_AGENTS_PATH,
  LESSONS_PATH,
  LINUX_HOST_PATH,
  LINUX_TERMINAL_DEVELOPERS_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  PARALLEL_PATH,
  WINDOWS_TERMINAL_DEVELOPERS_PATH,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";
import { FAQS, FEATURES, NOTES } from "./_components/content";
import { LINUX_DEMO } from "./_components/demo-tour";

const TITLE = "Linux Terminal for Developers Running Full Stacks";
const DESCRIPTION =
  "A Linux terminal workspace for developers: dev servers found in your repo, a log tab for each, and Claude Code and Codex beside them. As a .deb, .rpm or AppImage.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "linux terminal for developers",
    "terminal for linux developers",
    "best terminal for linux",
    "linux terminal app for developers",
    "run multiple dev servers linux",
    "claude code linux terminal",
    "ubuntu terminal for developers",
  ],
  alternates: {
    canonical: LINUX_TERMINAL_DEVELOPERS_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: LINUX_TERMINAL_DEVELOPERS_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: LINUX_TERMINAL_DEVELOPERS_PATH,
    about: [
      "terminal for Linux developers",
      "run multiple dev services on Linux",
      "Claude Code on Linux",
      "Ubuntu developer terminal",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    {
      name: "Terminal for Linux Developers",
      path: LINUX_TERMINAL_DEVELOPERS_PATH,
    },
  ]),
];

export default function TerminalForLinuxDevelopersPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <OsHero
        os="linux"
        eyebrow="Linux · x86-64 · beta"
        title="A Linux terminal for developers who run whole stacks."
        lede="lpm keeps every service, log and AI agent of a project in one window: it finds your dev servers, gives each a tab of its own, and keeps them running while you switch repos. Install it as a .deb, an .rpm or an AppImage; there's no Electron."
        source="linux-devs-hero"
      />
      <DemoSection {...LINUX_DEMO} />
      <OsFeatures
        eyebrow="Built for the way you work"
        title="A Linux terminal that knows what your project runs"
        description="Services, logs, agents and Git for each repo, in one window instead of a row of terminal tabs."
        features={FEATURES}
      />
      <OsInstall
        os="linux"
        title="Install lpm on Linux"
        description="64-bit x86 with glibc 2.35 or newer, such as Ubuntu 22.04 and up. Pick one of three packages."
      />
      <OsNotes
        title="How lpm on Linux differs from the Mac app"
        description="The same app on every system, with these differences on Linux."
        notes={NOTES}
      />
      <Faq title="What Linux developers ask before installing lpm" items={FAQS} />
      <RelatedPages
        links={[
          {
            href: LINUX_HOST_PATH,
            title: "Claude Code on a remote server",
            description:
              "Add a Linux box by typing user@host, and its agents keep working with your laptop shut.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code and Codex",
            description:
              "Agents beside your services, with live status and alerts when one needs you.",
          },
          {
            href: PARALLEL_PATH,
            title: "Run Claude Code in parallel",
            description:
              "A copy or a worktree for each agent, each with its own terminals and services.",
          },
          {
            href: WINDOWS_TERMINAL_DEVELOPERS_PATH,
            title: "Terminal for Windows developers",
            description:
              "The same workspace on Windows 11, with every command in Git Bash.",
          },
          {
            href: MAC_TERMINAL_DEVELOPERS_PATH,
            title: "Mac terminal for developers",
            description:
              "lpm on macOS, signed and notarized, on Apple Silicon and Intel.",
          },
          {
            href: LESSONS_PATH,
            title: "Lessons",
            description:
              "Short videos recorded in the app, from your first project to agents on a server.",
          },
        ]}
      />
      <OsCta
        os="linux"
        title="Your Linux terminal, built for development. Free and open source."
        body="Install the .deb, .rpm or AppImage and add a project: the services lpm finds are ready, so your first Start is one click."
        source="linux-devs-cta"
      />
    </>
  );
}
