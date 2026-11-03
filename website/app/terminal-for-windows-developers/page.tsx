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
  LINUX_TERMINAL_DEVELOPERS_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  PARALLEL_PATH,
  PROJECT_SIDEBAR_PATH,
  WINDOWS_TERMINAL_DEVELOPERS_PATH,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";
import { FAQS, FEATURES, NOTES } from "./_components/content";
import { WINDOWS_DEMO } from "./_components/demo-tour";

const TITLE = "Terminal for Windows Developers Running Full Stacks";
const DESCRIPTION =
  "A Windows 11 terminal workspace for developers: dev servers found in your repo, a log tab for each, and Claude Code and Codex beside them, all in Git Bash.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "terminal for windows developers",
    "windows terminal for developers",
    "best terminal for windows 11",
    "developer terminal windows",
    "run multiple dev servers windows",
    "claude code windows terminal",
    "git bash terminal app",
  ],
  alternates: {
    canonical: WINDOWS_TERMINAL_DEVELOPERS_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: WINDOWS_TERMINAL_DEVELOPERS_PATH,
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
    path: WINDOWS_TERMINAL_DEVELOPERS_PATH,
    about: [
      "terminal for Windows developers",
      "run multiple dev services on Windows",
      "Git Bash",
      "Claude Code on Windows",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    {
      name: "Terminal for Windows Developers",
      path: WINDOWS_TERMINAL_DEVELOPERS_PATH,
    },
  ]),
];

export default function TerminalForWindowsDevelopersPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <OsHero
        os="windows"
        eyebrow="Windows 11 · beta"
        title="A terminal for Windows developers who run whole stacks."
        lede="lpm puts every service, log and AI agent of a project in one window: it finds your dev servers, gives each a tab of its own, and keeps them running while you switch repos. Commands run in Git Bash, and there's no Electron."
        source="windows-devs-hero"
      />
      <DemoSection {...WINDOWS_DEMO} />
      <OsFeatures
        eyebrow="Built for the way you work"
        title="A Windows terminal that knows what your project runs"
        description="Services, logs, agents and Git for each repo, in one window instead of a row of terminal tabs."
        features={FEATURES}
      />
      <OsInstall
        os="windows"
        title="Install lpm on Windows"
        description="Windows 11 on an x64 PC, with Git for Windows installed. The installer needs no admin rights."
      />
      <OsNotes
        title="How lpm on Windows differs from the Mac app"
        description="The same app on every system, with these differences on Windows."
        notes={NOTES}
      />
      <Faq title="What Windows developers ask before installing lpm" items={FAQS} />
      <RelatedPages
        links={[
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
            href: PROJECT_SIDEBAR_PATH,
            title: "Terminal with a project sidebar",
            description:
              "The project list up close: folders, copies, running dots and agents waiting on you.",
          },
          {
            href: LINUX_TERMINAL_DEVELOPERS_PATH,
            title: "Terminal for Linux developers",
            description:
              "The same workspace as a .deb, .rpm or AppImage, and as a host on a server.",
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
        os="windows"
        title="Your Windows terminal, built for development. Free, and ready in minutes."
        body="Install Git for Windows, run the installer, and add a project: the services lpm finds are ready, so your first Start is one click."
        source="windows-devs-cta"
      />
    </>
  );
}
