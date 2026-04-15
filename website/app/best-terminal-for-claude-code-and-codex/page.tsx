import type { Metadata } from "next";
import { AI_AGENTS_PATH } from "@/lib/links";
import Benefits from "./_components/benefits";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import WhyParallel from "./_components/why-parallel";
import Workflows from "./_components/workflows";

export const metadata: Metadata = {
  title: "Best Terminal for Claude Code & Codex AI Agents",
  description:
    "lpm is the terminal workspace built for running Claude Code and Codex in parallel on the same codebase. Start your dev stack in one command and keep every agent in view.",
  keywords: [
    "best terminal for claude code",
    "best terminal for codex",
    "claude code terminal",
    "codex terminal",
    "parallel ai agents",
    "ai coding agents",
    "claude code and codex",
    "ai agent workspace",
    "lpm",
    "local project manager",
    "dev stack manager",
  ],
  alternates: {
    canonical: AI_AGENTS_PATH,
  },
  openGraph: {
    title: "Best Terminal for Claude Code & Codex AI Agents",
    description:
      "Run Claude Code and Codex side by side on the same codebase. lpm is the terminal workspace for developers using AI coding agents in parallel.",
    type: "website",
    url: AI_AGENTS_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "Best Terminal for Claude Code & Codex AI Agents",
    description:
      "Run Claude Code and Codex side by side on the same codebase. lpm is the terminal workspace for developers using AI coding agents in parallel.",
  },
};

export default function BestTerminalForClaudeCodeAndCodexPage() {
  return (
    <>
      <Hero />
      <WhyParallel />
      <Features />
      <Benefits />
      <Workflows />
      <Comparison />
      <Faq />
      <Cta />
    </>
  );
}
