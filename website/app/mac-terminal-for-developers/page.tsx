import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { MAC_TERMINAL_DEVELOPERS_PATH } from "@/lib/links";
import Benefits from "./_components/benefits";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Problem from "./_components/problem";
import Workflows from "./_components/workflows";

export const metadata: Metadata = {
  title: "Mac Terminal for Developers — Run Your Full Stack",
  description:
    "lpm is a Mac terminal built for developers — launch your full stack in one window, track per-service logs, and switch between repos without losing context.",
  keywords: [
    "mac terminal for developers",
    "terminal for mac developers",
    "developer terminal mac",
    "mac terminal dev tools",
    "mac terminal monorepo",
    "best terminal for full stack development",
    "mac terminal for web developers",
    "mac terminal for node developers",
    "mac terminal for python developers",
    "mac terminal multi service",
    "mac terminal git workflow",
    "vs code terminal alternative mac",
    "warp terminal alternative",
    "iterm2 alternative mac",
    "mac terminal apple silicon",
    "run multiple services mac terminal",
    "mac dev environment terminal",
    "lpm",
    "local project manager",
  ],
  alternates: {
    canonical: MAC_TERMINAL_DEVELOPERS_PATH,
  },
  openGraph: {
    title: "Mac Terminal for Developers — Run Your Full Stack",
    description:
      "Launch every service in your stack from one Mac terminal window. Per-service logs, instant project switching, and native Apple Silicon performance.",
    type: "website",
    url: MAC_TERMINAL_DEVELOPERS_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mac Terminal for Developers — Run Your Full Stack",
    description:
      "A Mac terminal workspace for developers. Run every service side by side, switch repos without losing context, and coordinate AI agents.",
  },
};

export default function MacTerminalForDevelopersPage() {
  return (
    <>
      <Hero />
      <DemoSection />
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
