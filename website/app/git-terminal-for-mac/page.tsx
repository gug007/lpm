import type { Metadata } from "next";
import { GIT_TERMINAL_MAC_PATH } from "@/lib/links";
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
    "git terminal mac",
    "best git terminal for mac",
    "mac terminal for git",
    "git terminal macos",
    "terminal git workflow mac",
    "mac git client terminal",
    "git rebase terminal mac",
    "git branching terminal mac",
    "git terminal vs gui mac",
    "gitkraken alternative mac",
    "sourcetree alternative mac",
    "tower git alternative mac",
    "iterm2 git workflow",
    "mac terminal for github",
    "terminal git and dev server mac",
    "git pr workflow terminal mac",
    "mac terminal branch switching",
    "lpm",
    "local project manager",
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

export default function GitTerminalForMacPage() {
  return (
    <>
      <Hero />
      <Problem />
      <Features />
      <Benefits />
      <Workflows />
      <Comparison />
      <Faq />
      <Cta />
    </>
  );
}
