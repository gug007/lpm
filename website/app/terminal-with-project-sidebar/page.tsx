import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  BEST_TERMINAL_MAC_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  PROJECT_SIDEBAR_PATH,
  REVIEW_CHANGES_PATH,
  SSH_TERMINAL_MAC_PATH,
  WORKTREE_AGENTS_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdString,
  webPageJsonLd,
} from "@/lib/structured-data";
import AppExample from "./_components/app-example";
import Cta from "./_components/cta";
import Faq, { FAQ_ITEMS } from "./_components/faq";
import FieldGuide from "./_components/field-guide";
import Hero from "./_components/hero";
import SidebarExtras from "./_components/sidebar-extras";
import Situations from "./_components/situations";
import WalkthroughSection from "./_components/walkthrough-section";
import WhichSidebar from "./_components/which-sidebar";

const TITLE = "Mac Terminal with a Project Sidebar and Agent Status";
const DESCRIPTION =
  "A Mac terminal with a project sidebar, not a file tree or tab strip. Switch projects without losing terminals, scrollback, running state, or agent signals.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "terminal with sidebar",
    "terminal with project sidebar",
    "mac terminal sidebar",
    "terminal app with project list",
    "terminal sidebar instead of tabs",
    "project switcher terminal mac",
    "terminal workspace mac",
  ],
  alternates: {
    canonical: PROJECT_SIDEBAR_PATH,
  },
  openGraph: {
    title: TITLE,
    description:
      "One persistent row per project, holding its terminals, its running state, and its agent attention signals. Try the interruption test: flat tabs versus a project sidebar.",
    type: "website",
    url: PROJECT_SIDEBAR_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "A project list, not a file tree and not a vertical tab strip. See what a sidebar row can tell you about a project — and what it deliberately cannot.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: PROJECT_SIDEBAR_PATH,
    about: [
      "terminal with a project sidebar",
      "Mac terminal project list",
      "switching projects without losing terminal state",
      "Claude Code and Codex status in a sidebar",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Terminal with a Project Sidebar", path: PROJECT_SIDEBAR_PATH },
  ]),
  faqJsonLd(FAQ_ITEMS),
];

export default function TerminalWithProjectSidebarPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <AppExample />
      <WalkthroughSection />
      <WhichSidebar />
      <FieldGuide />
      <SidebarExtras />
      <Situations />
      <Faq />
      <RelatedPages
        links={[
          {
            href: BEST_TERMINAL_MAC_PATH,
            title: "Best terminal for Mac",
            description:
              "The wider comparison: how a project-aware workspace stacks up against Terminal, iTerm2, and the Electron terminals.",
          },
          {
            href: MAC_TERMINAL_DEVELOPERS_PATH,
            title: "Mac terminal for developers",
            description:
              "What sits behind a sidebar row — per-service panes, logs, and starting a whole stack in one click.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Terminal for Claude Code & Codex",
            description:
              "The attention states in full: how agent progress and questions surface while you work elsewhere.",
          },
          {
            href: SSH_TERMINAL_MAC_PATH,
            title: "SSH terminal for Mac",
            description:
              "How remote boxes join the same project list, with forwarded ports and remote services in panes.",
          },
          {
            href: WORKTREE_AGENTS_PATH,
            title: "Git worktrees for AI agents",
            description:
              "Why copies and worktrees nest under their parent, and when to reach for each.",
          },
          {
            href: REVIEW_CHANGES_PATH,
            title: "Review changes in terminal",
            description:
              "Open a row, press ⌘⇧R, and read every change its agent made before you commit.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
