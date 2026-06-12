import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import {
  BEST_TERMINAL_MAC_PATH,
  GIT_TERMINAL_MAC_PATH,
  vsPath,
} from "@/lib/links";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/structured-data";
import Benefits from "./_components/benefits";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Problem from "./_components/problem";
import Workflows from "./_components/workflows";

export const metadata: Metadata = {
  title: "Git Terminal for Mac — Branch, Rebase, and Ship Faster",
  description:
    "lpm is the git terminal for Mac developers — run git workflows alongside your dev servers in one native window, watch CI logs, and never lose branch context again.",
  keywords: [
    "git terminal for mac",
    "best git terminal for mac",
    "mac terminal for git",
    "git terminal macos",
    "terminal git workflow mac",
    "git branching terminal mac",
  ],
  alternates: {
    canonical: GIT_TERMINAL_MAC_PATH,
  },
  openGraph: {
    title: "Git Terminal for Mac — Branch, Rebase, and Ship Faster",
    description:
      "Run every git workflow alongside your dev servers in one native Mac window. No context switching between a GUI git client and a separate terminal.",
    type: "website",
    url: GIT_TERMINAL_MAC_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "Git Terminal for Mac — Branch, Rebase, and Ship Faster",
    description:
      "The Mac terminal that keeps your git workflow and your dev servers in the same window. Branch, rebase, watch CI — without ever leaving lpm.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: "Git Terminal for Mac — Branch, Rebase, and Ship Faster",
    description:
      "lpm is the git terminal for Mac developers — run git workflows alongside your dev servers in one native window, watch CI logs, and never lose branch context again.",
    path: GIT_TERMINAL_MAC_PATH,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Git Terminal for Mac", path: GIT_TERMINAL_MAC_PATH },
  ]),
];

export default function GitTerminalForMacPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Hero />
      <DemoSection />
      <Problem />
      <Features />
      <Benefits />
      <Workflows />
      <Comparison />
      <Faq />
      <RelatedPages
        links={[
          {
            href: BEST_TERMINAL_MAC_PATH,
            title: "Best terminal for Mac",
            description:
              "Why a native Apple Silicon workspace beats Electron terminals and tab strips.",
          },
          {
            href: vsPath("tmux"),
            title: "lpm vs tmux",
            description:
              "How lpm compares to tmux for running services and shells side by side.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
